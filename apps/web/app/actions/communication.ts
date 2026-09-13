"use server";

import { revalidatePath } from "next/cache";

import { oneOf, requiredText, uuid } from "@loop/validation";

import type { ActionState } from "@/app/actions/core";
import { requireViewer } from "@/lib/auth";
import { schedulePushDispatch, waitUntilPushDispatch } from "@/lib/push/schedule";
import { createClient } from "@/lib/supabase/server";

function actionError(error: unknown, fallback: string): ActionState {
  return { status: "error", message: error instanceof Error && error.name === "ValidationError" ? error.message : fallback };
}

function optionalUuid(value: FormDataEntryValue | null, label: string) {
  return value ? uuid(value, label) : null;
}

function timezoneOffset(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second")) - instant.getTime();
}

function instant(value: FormDataEntryValue | null, label: string, timezone: string) {
  const text = requiredText(value, label, 40);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text);
  if (!match) throw new Error(`${label} is invalid.`);
  const wallClock = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  let candidate = new Date(wallClock);
  candidate = new Date(wallClock - timezoneOffset(candidate, timezone));
  candidate = new Date(wallClock - timezoneOffset(candidate, timezone));
  if (Number.isNaN(candidate.getTime())) throw new Error(`${label} is invalid.`);
  return candidate.toISOString();
}

export async function startGuardianThreadAction(formData: FormData) {
  const viewer = await requireViewer(["guardian"]);
  const childId = uuid(formData.get("child_id"), "Child");
  const supabase = await createClient();
  const existing = await supabase.from("message_threads").select("id").eq("child_id", childId).eq("guardian_membership_id", viewer.membershipId!).maybeSingle();
  if (!existing.data) {
    const created = await supabase.from("message_threads").insert({ school_id: viewer.schoolId!, child_id: childId, guardian_membership_id: viewer.membershipId! }).select("id").single();
    if (created.error) throw new Error("The conversation could not be started.");
  }
  revalidatePath("/messages");
}

export async function sendMessageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const viewer = await requireViewer(["school_admin", "teacher", "guardian"]);
    const threadId = uuid(formData.get("thread_id"), "Conversation");
    const body = requiredText(formData.get("body"), "Message", 2000);
    const { error } = await (await createClient()).from("messages").insert({
      thread_id: threadId,
      school_id: viewer.schoolId!,
      sender_membership_id: viewer.membershipId!,
      sender_user_id: viewer.userId,
      body,
    });
    if (error) return { status: "error", message: "The message was not sent. Your access may have changed." };
    waitUntilPushDispatch();
    revalidatePath("/messages");
    return { status: "success", message: "Message sent." };
  } catch (error) {
    return actionError(error, "The message was not sent.");
  }
}

export async function markThreadReadAction(threadId: string) {
  const viewer = await requireViewer(["school_admin", "teacher", "guardian"]);
  await (await createClient()).from("message_thread_reads").upsert({
    thread_id: uuid(threadId, "Conversation"),
    school_id: viewer.schoolId!,
    membership_id: viewer.membershipId!,
    last_read_at: new Date().toISOString(),
  }, { onConflict: "thread_id,membership_id" });
}

export async function saveAnnouncementAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin", "teacher"]);
  const announcementId = optionalUuid(formData.get("announcement_id"), "Announcement");
  const targetScope = oneOf(formData.get("target_scope"), ["school", "branch", "classroom"] as const, "Audience");
  const status = oneOf(formData.get("status"), ["draft", "published", "archived"] as const, "Status");
  const record = {
    school_id: viewer.schoolId!,
    target_scope: targetScope,
    branch_id: targetScope === "branch" ? optionalUuid(formData.get("branch_id"), "Branch") : null,
    classroom_id: targetScope === "classroom" ? optionalUuid(formData.get("classroom_id"), "Classroom") : null,
    title: requiredText(formData.get("title"), "Title", 120),
    body: requiredText(formData.get("body"), "Announcement", 4000),
    priority: oneOf(formData.get("priority"), ["normal", "important"] as const, "Priority"),
    status,
    publish_at: status === "published" ? new Date().toISOString() : null,
    expires_at: formData.get("expires_at") ? instant(formData.get("expires_at"), "Expiry", viewer.timezone) : null,
  };
  const supabase = await createClient();
  const result = announcementId
    ? await supabase.from("announcements").update(record).eq("id", announcementId)
    : await supabase.from("announcements").insert({ ...record, created_by_membership_id: viewer.membershipId!, created_by_user_id: viewer.userId });
  if (result.error) throw new Error("The announcement could not be saved.");
  schedulePushDispatch();
  revalidatePath("/updates");
}

export async function saveCalendarEventAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin", "teacher"]);
  const eventId = optionalUuid(formData.get("event_id"), "Calendar event");
  const targetScope = oneOf(formData.get("target_scope"), ["school", "branch", "classroom"] as const, "Audience");
  const record = {
    school_id: viewer.schoolId!,
    target_scope: targetScope,
    branch_id: targetScope === "branch" ? optionalUuid(formData.get("branch_id"), "Branch") : null,
    classroom_id: targetScope === "classroom" ? optionalUuid(formData.get("classroom_id"), "Classroom") : null,
    title: requiredText(formData.get("title"), "Title", 120),
    description: formData.get("description") ? requiredText(formData.get("description"), "Description", 1000) : null,
    location: formData.get("location") ? requiredText(formData.get("location"), "Location", 160) : null,
    starts_at: instant(formData.get("starts_at"), "Start", viewer.timezone),
    ends_at: instant(formData.get("ends_at"), "End", viewer.timezone),
    all_day: formData.get("all_day") === "on",
    status: oneOf(formData.get("status"), ["active", "inactive", "archived"] as const, "Status"),
  };
  if (new Date(record.ends_at) <= new Date(record.starts_at)) throw new Error("End must be after start.");
  const supabase = await createClient();
  const result = eventId ? await supabase.from("calendar_events").update(record).eq("id", eventId) : await supabase.from("calendar_events").insert({ ...record, created_by_membership_id: viewer.membershipId!, created_by_user_id: viewer.userId });
  if (result.error) throw new Error("The calendar event could not be saved.");
  revalidatePath("/updates");
}
