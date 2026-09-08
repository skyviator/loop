import { redirect } from "next/navigation";

import { routeForRole, type AppRole } from "@loop/domain";

import { createClient } from "./supabase/server";

export type Viewer = {
  userId: string;
  role: AppRole | null;
  membershipId: string | null;
  schoolId: string | null;
  schoolName: string | null;
  timezone: string;
};

export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") return null;

  const [platform, memberships] = await Promise.all([
    supabase.from("platform_administrators").select("user_id").eq("user_id", userId).eq("status", "active").maybeSingle(),
    supabase.from("school_memberships").select("id, school_id, role").eq("user_id", userId).eq("status", "active"),
  ]);

  if (platform.data) {
    return { userId, role: "super_admin", membershipId: null, schoolId: null, schoolName: null, timezone: "Asia/Colombo" };
  }

  const membership = memberships.data?.sort((left, right) => {
    const rank = { school_admin: 0, teacher: 1, guardian: 2 };
    return rank[left.role] - rank[right.role];
  })[0];
  if (!membership) {
    return { userId, role: null, membershipId: null, schoolId: null, schoolName: null, timezone: "Asia/Colombo" };
  }

  const school = await supabase.from("schools").select("name, timezone").eq("id", membership.school_id).maybeSingle();
  return {
    userId,
    role: membership.role,
    membershipId: membership.id,
    schoolId: membership.school_id,
    schoolName: school.data?.name ?? "School",
    timezone: school.data?.timezone ?? "Asia/Colombo",
  };
}

export async function requireViewer(allowed?: readonly AppRole[]) {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  if (!viewer.role) redirect("/access");
  if (allowed && !allowed.includes(viewer.role)) redirect(routeForRole(viewer.role));
  return viewer;
}
