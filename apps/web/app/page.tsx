import { redirect } from "next/navigation";

import { routeForRole } from "@loop/domain";

import { getViewer } from "@/lib/auth";

export default async function Home() {
  const viewer = await getViewer();
  redirect(viewer ? routeForRole(viewer.role) : "/sign-in");
}
