import { notFound } from "next/navigation";

import { SchoolAdminPage, type SchoolAdminView } from "../page";

const views = new Set<SchoolAdminView>(["people", "classrooms", "timetable", "features", "settings"]);

export default async function FocusedSchoolAdminPage({ params, searchParams }: {
  params: Promise<{ view: string }>;
  searchParams: Promise<{ invite?: string; inviteError?: string; membershipError?: string; staffError?: string }>;
}) {
  const { view } = await params;
  if (!views.has(view as SchoolAdminView)) notFound();
  return <SchoolAdminPage searchParams={searchParams} view={view as SchoolAdminView} />;
}
