"use server";

import { revalidatePath } from "next/cache";

import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function checked(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

export async function saveNotificationPreferencesAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin", "teacher", "guardian"]);
  const { error } = await (await createClient()).from("notification_preferences").upsert({
    user_id: viewer.userId,
    attendance_enabled: viewer.role === "guardian" ? checked(formData.get("attendance_enabled")) : true,
    messages_enabled: checked(formData.get("messages_enabled")),
    important_announcements_enabled: checked(formData.get("important_announcements_enabled")),
    photos_enabled: viewer.role === "guardian" && checked(formData.get("photos_enabled")),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Notification preferences could not be saved.");
  revalidatePath("/settings");
}
