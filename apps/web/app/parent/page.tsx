import Link from "next/link";

import { deriveTimetableStatus, mergeTimeline, type TimelineItem } from "@loop/domain";

import { AppShell, StatusNote } from "@/components/app-shell";
import { LoopIcon } from "@/components/loop-icon";
import { PrivatePhoto } from "@/components/private-photo";
import { requireViewer } from "@/lib/auth";
import { guardianNavigation } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

const statusCopy = { upcoming: "Later", now: "Now", confirmed: "Confirmed", ended_unconfirmed: "Ended — no update yet", absent: "Absent" };

function outcomeCopy(value: string | null) {
  const labels: Record<string, string> = {
    ate_all: "Ate all", ate_most: "Ate most", ate_some: "Ate some", ate_little: "Ate a little", none_refused: "None / refused",
    drank_well: "Drank well", some: "Some", sips: "A few sips", pee: "Pee", poop: "Poop", both: "Both", tried: "Tried — no result",
    wet: "Wet", soiled: "Soiled", dry: "Dry check", settled: "Settled", happy: "Happy", quiet: "Quiet", upset: "Upset",
  };
  return value ? labels[value] ?? value.replaceAll("_", " ") : "Update recorded";
}

function durationCopy(start: string, end: string) {
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}

function calendarDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(value));
}

function careTitle(category: string, outcome: string | null) {
  if (category === "activity" && outcome) return outcome;
  if (category === "note") return "Teacher note";
  return { meal: "Meal", bottle: "Bottle", water: "Water", sleep: "Sleep", toilet: "Toilet", nappy: "Nappy", mood: "Mood" }[category] ?? "Care update";
}

function careDetail(item: { outcome_code: string | null; meal_outcome: string | null; quantity: number | null; unit: string | null; note: string | null }) {
  const quantity = item.quantity ? `${item.quantity} ${item.unit ?? ""}`.trim() : null;
  const outcome = outcomeCopy(item.meal_outcome ?? item.outcome_code);
  return [quantity, outcome === "Update recorded" || item.outcome_code === "note" ? null : outcome, item.note].filter(Boolean).join(" · ") || "Update recorded";
}

export default async function ParentPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const viewer = await requireViewer(["guardian"]);
  const state = await searchParams;
  const supabase = await createClient();
  const links = await supabase.from("child_guardians").select("child_id, is_primary, children(id, preferred_name, child_enrollments(id, classroom_id, status))").eq("guardian_membership_id", viewer.membershipId!).eq("status", "active").order("is_primary", { ascending: false }).order("created_at");
  const selectedLink = links.data?.find((link) => link.child_id === state.child) ?? links.data?.[0];
  if (!selectedLink) return <AppShell eyebrow={viewer.schoolName ?? "School"} title="Today" nav={guardianNavigation} contentWidth="standard"><StatusNote tone="warning">No child is linked to this guardian account. Ask the school administrator to review the guardian link.</StatusNote></AppShell>;
  const childId = selectedLink.child_id;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: viewer.timezone }).format(new Date());
  const weekday = new Date(`${today}T00:00:00+05:30`).getUTCDay() || 7;
  const enrollment = selectedLink.children?.child_enrollments.find((item) => item.status === "active");
  if (!enrollment) return <AppShell eyebrow={viewer.schoolName ?? "School"} title="Today" nav={guardianNavigation} contentWidth="standard"><StatusNote tone="warning">This child does not have an active classroom enrollment.</StatusNote></AppShell>;

  const [attendance, care, slots, exceptions, photoLinks] = await Promise.all([
    supabase.from("attendance_records").select("id, status, checked_in_at, checked_out_at").eq("child_id", childId).eq("service_date", today).maybeSingle(),
    supabase.from("care_events").select("id, category, status, recorded_at, started_at, ended_at, outcome_code, meal_outcome, quantity, unit, note, timetable_slot_id").eq("child_id", childId).gte("recorded_at", `${today}T00:00:00+05:30`).lt("recorded_at", `${today}T23:59:59+05:30`).order("recorded_at"),
    supabase.from("timetable_slots").select("id, title, start_time, end_time, care_feature_key").eq("classroom_id", enrollment.classroom_id).eq("day_of_week", weekday).eq("status", "active").order("start_time"),
    supabase.from("timetable_exceptions").select("timetable_slot_id, kind, replacement_title, replacement_start_time, replacement_end_time").eq("classroom_id", enrollment.classroom_id).eq("service_date", today).eq("status", "active"),
    supabase.from("media_asset_children").select("asset_id, media_assets(id, caption, created_at, status)").eq("child_id", childId).order("created_at", { referencedTable: "media_assets", ascending: false }).limit(12),
  ]);
  const exceptionBySlot = new Map(exceptions.data?.filter((item) => item.timetable_slot_id).map((item) => [item.timetable_slot_id, item]));
  const careBySlot = new Map(care.data?.filter((item) => item.timetable_slot_id).map((item) => [item.timetable_slot_id, item]));
  const attendanceStatus = attendance.data?.status ?? "expected";
  const attendanceItems: TimelineItem[] = attendance.data?.checked_in_at ? [{ id: attendance.data.id, occurredAt: attendance.data.checked_in_at, kind: "attendance", title: "Arrived", detail: "Checked in" }] : [];
  if (attendance.data?.checked_out_at) attendanceItems.push({ id: `${attendance.data.id}-out`, occurredAt: attendance.data.checked_out_at, kind: "attendance", title: "Pickup", detail: "Checked out" });
  const timetableItems: TimelineItem[] = (slots.data ?? []).filter((slot) => exceptionBySlot.get(slot.id)?.kind !== "cancelled").map((slot) => {
    const exception = exceptionBySlot.get(slot.id);
    const linkedCare = careBySlot.get(slot.id);
    const startTime = exception?.replacement_start_time ?? slot.start_time;
    const endTime = exception?.replacement_end_time ?? slot.end_time;
    return {
      id: slot.id,
      occurredAt: `${today}T${startTime}+05:30`,
      kind: "timetable",
      title: exception?.replacement_title ?? slot.title,
      detail: linkedCare ? linkedCare.category === "sleep" && linkedCare.started_at ? (linkedCare.ended_at ? `Nap ended · ${durationCopy(linkedCare.started_at, linkedCare.ended_at)}` : "Nap started") : careDetail(linkedCare) : undefined,
      status: deriveTimetableStatus({ now: new Date(), serviceDate: today, startTime, endTime, timezone: viewer.timezone, attendance: attendanceStatus, confirmed: Boolean(linkedCare && linkedCare.status === "recorded") }),
    };
  });
  const linkedIds = new Set([...careBySlot.values()].map((item) => item.id));
  const standaloneCare: TimelineItem[] = (care.data ?? []).filter((item) => !linkedIds.has(item.id)).flatMap((item) => {
    if (item.category === "sleep" && item.started_at) {
      const sleepItems: TimelineItem[] = [{ id: `${item.id}-start`, occurredAt: item.started_at, kind: "care", title: "Nap started", status: "confirmed" }];
      if (item.ended_at) sleepItems.push({ id: `${item.id}-end`, occurredAt: item.ended_at, kind: "care", title: "Nap ended", detail: durationCopy(item.started_at, item.ended_at), status: "confirmed" });
      return sleepItems;
    }
    return [{ id: item.id, occurredAt: item.recorded_at, kind: "care", title: careTitle(item.category, item.outcome_code), detail: careDetail(item), status: "confirmed" }];
  });
  const timeline = mergeTimeline(attendanceItems, timetableItems, standaloneCare);
  const todayPhotos = (photoLinks.data ?? []).filter((link) => link.media_assets?.status === "ready" && calendarDate(link.media_assets.created_at, viewer.timezone) === today);
  const childName = selectedLink.children?.preferred_name ?? "Child";

  return <AppShell eyebrow={viewer.schoolName ?? "School"} title="Today" nav={guardianNavigation} contentWidth="standard">
    <section className="parent-heading"><div><p className="eyebrow">Child</p><h2>{childName}</h2></div>{(links.data?.length ?? 0) > 1 ? <div className="child-switcher" aria-label="Choose child">{links.data?.map((link) => <Link className={link.child_id === childId ? "selected" : ""} key={link.child_id} href={`/parent?child=${link.child_id}`}>{link.children?.preferred_name ?? "Child"}</Link>)}</div> : null}<time>{new Date(`${today}T12:00:00+05:30`).toLocaleDateString("en-LK", { weekday: "long", day: "numeric", month: "long" })}</time></section>
    {attendanceStatus === "absent" || attendanceStatus === "excused" ? <StatusNote tone="warning">{childName} is marked {attendanceStatus}. Timetable activities are not shown as completed.</StatusNote> : null}
    {todayPhotos.length ? <section className="today-photos" aria-label={`${childName}'s photos`}><div className="section-heading"><div><p className="eyebrow">Shared privately</p><h2>Photos today</h2></div></div><div className="photo-grid">{todayPhotos.map((link) => <PrivatePhoto assetId={link.asset_id} caption={link.media_assets?.caption ?? null} key={link.asset_id} />)}</div></section> : null}
    <section id="timeline" className={timeline.length ? "timeline" : "timeline timeline-is-empty"} aria-label={`${childName}'s timeline`}>
      {timeline.map((item) => <article className={`timeline-item timeline-${item.status ?? "confirmed"}`} key={`${item.kind}-${item.id}`}><time>{new Date(item.occurredAt).toLocaleTimeString("en-LK", { hour: "numeric", minute: "2-digit", timeZone: viewer.timezone })}</time><span className="timeline-dot"><LoopIcon name={item.kind === "attendance" ? "attendance" : item.kind === "care" ? "note" : "clock"} className="size-5" /></span><div><h3>{item.title}</h3>{item.detail ? <p>{item.detail}</p> : null}</div><strong>{item.status ? statusCopy[item.status] : "Recorded"}</strong></article>)}
      {!timeline.length ? <div className="timeline-empty"><LoopIcon name="calendar" className="size-8" /><h2>No updates yet</h2><p>Today’s attendance, timetable, and care updates will appear here.</p></div> : null}
    </section>
  </AppShell>;
}
