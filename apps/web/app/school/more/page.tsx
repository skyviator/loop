import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { LoopIcon } from "@/components/loop-icon";
import { requireViewer } from "@/lib/auth";
import { schoolAdminMoreNavigation, schoolAdminNavigation } from "@/lib/navigation";

const descriptions: Record<string, string> = {
  "/school#classrooms": "Manage branches and classroom structure.",
  "/school#timetable": "Review the school timetable.",
  "/school#features": "Configure available school features.",
  "/school#settings": "Update school details and preferences.",
  "/settings": "Manage your notifications and account settings.",
};

export default async function SchoolMorePage() {
  const viewer = await requireViewer(["school_admin"]);

  return (
    <AppShell eyebrow={viewer.schoolName ?? "School"} title="More" nav={schoolAdminNavigation}>
      <section className="section-panel">
        <nav className="more-navigation-list" aria-label="More school administration">
          {schoolAdminMoreNavigation.map((item) => (
            <Link className="more-navigation-link" href={item.href} key={item.href} data-more-destination>
              <LoopIcon name={item.icon} className="size-5" />
              <span>
                <strong>{item.label}</strong>
                <small>{descriptions[item.href]}</small>
              </span>
              <LoopIcon name="chevron" className="size-5" />
            </Link>
          ))}
        </nav>
      </section>
    </AppShell>
  );
}
