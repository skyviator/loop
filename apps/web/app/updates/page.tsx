import { saveAnnouncementAction, saveCalendarEventAction } from "@/app/actions/communication";
import { AppShell, StatusNote } from "@/components/app-shell";
import { requireViewer } from "@/lib/auth";
import { communicationNavigation } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

type AudienceItem = { id: string; name: string };
type Announcement = {
  id: string; target_scope: "school" | "branch" | "classroom"; branch_id: string | null; classroom_id: string | null;
  title: string; body: string; priority: "normal" | "important"; status: "draft" | "published" | "archived";
  expires_at: string | null; created_by_membership_id: string;
};
type CalendarEvent = {
  id: string; target_scope: "school" | "branch" | "classroom"; branch_id: string | null; classroom_id: string | null;
  title: string; description: string | null; location: string | null; starts_at: string; ends_at: string; all_day: boolean;
  status: "active" | "inactive" | "archived"; created_by_membership_id: string;
};

function localDateTime(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function AudienceFields({ role, branches, classrooms, value }: { role: "school_admin" | "teacher" | "guardian"; branches: AudienceItem[]; classrooms: AudienceItem[]; value?: Pick<Announcement, "target_scope" | "branch_id" | "classroom_id"> }) {
  const teacher = role === "teacher";
  return <>
    <label className="field"><span>Audience</span><select name="target_scope" defaultValue={teacher ? "classroom" : value?.target_scope ?? "school"} disabled={teacher}><option value="school">Whole school</option><option value="branch">Branch</option><option value="classroom">Classroom</option></select>{teacher ? <input type="hidden" name="target_scope" value="classroom" /> : null}</label>
    {!teacher ? <label className="field"><span>Branch when selected</span><select name="branch_id" defaultValue={value?.branch_id ?? ""}><option value="">Choose branch</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label> : null}
    <label className="field"><span>Classroom when selected</span><select name="classroom_id" defaultValue={value?.classroom_id ?? ""}><option value="">Choose classroom</option>{classrooms.map((room) => <option value={room.id} key={room.id}>{room.name}</option>)}</select></label>
  </>;
}

function AnnouncementEditor({ role, branches, classrooms, timezone, item }: { role: "school_admin" | "teacher" | "guardian"; branches: AudienceItem[]; classrooms: AudienceItem[]; timezone: string; item?: Announcement }) {
  return <details className="editor"><summary>{item ? "Edit announcement" : "Create announcement"}</summary><form action={saveAnnouncementAction} className="form-stack">
    {item ? <input type="hidden" name="announcement_id" value={item.id} /> : null}
    <AudienceFields role={role} branches={branches} classrooms={classrooms} value={item} />
    <label className="field"><span>Title</span><input name="title" maxLength={120} defaultValue={item?.title} required /></label>
    <label className="field"><span>Announcement</span><textarea name="body" maxLength={4000} rows={4} defaultValue={item?.body} required /></label>
    <label className="field"><span>Priority</span><select name="priority" defaultValue={item?.priority ?? "normal"}><option value="normal">Normal</option><option value="important">Important</option></select></label>
    <label className="field"><span>Optional expiry ({timezone})</span><input type="datetime-local" name="expires_at" defaultValue={item?.expires_at ? localDateTime(item.expires_at, timezone) : undefined} /></label>
    <div className="form-footer"><button className="button button-secondary" name="status" value="draft">Save draft</button><button className="button button-primary" name="status" value="published">Publish</button>{item ? <button className="text-button" name="status" value="archived">Archive</button> : null}</div>
  </form></details>;
}

function CalendarEditor({ role, branches, classrooms, timezone, item }: { role: "school_admin" | "teacher" | "guardian"; branches: AudienceItem[]; classrooms: AudienceItem[]; timezone: string; item?: CalendarEvent }) {
  return <details className="editor"><summary>{item ? "Edit event" : "Add calendar event"}</summary><form action={saveCalendarEventAction} className="form-stack">
    {item ? <input type="hidden" name="event_id" value={item.id} /> : null}
    <AudienceFields role={role} branches={branches} classrooms={classrooms} value={item} />
    <label className="field"><span>Title</span><input name="title" maxLength={120} defaultValue={item?.title} required /></label>
    <label className="field"><span>Description</span><textarea name="description" maxLength={1000} rows={3} defaultValue={item?.description ?? ""} /></label>
    <label className="field"><span>Location</span><input name="location" maxLength={160} defaultValue={item?.location ?? ""} /></label>
    <label className="field"><span>Starts ({timezone})</span><input type="datetime-local" name="starts_at" defaultValue={item ? localDateTime(item.starts_at, timezone) : undefined} required /></label>
    <label className="field"><span>Ends ({timezone})</span><input type="datetime-local" name="ends_at" defaultValue={item ? localDateTime(item.ends_at, timezone) : undefined} required /></label>
    <label className="check-field"><input type="checkbox" name="all_day" defaultChecked={item?.all_day} /> All-day event</label>
    <div className="form-footer"><button className="button button-primary" name="status" value="active">{item ? "Save event" : "Add event"}</button>{item ? <button className="text-button" name="status" value="archived">Archive</button> : null}</div>
  </form></details>;
}

export default async function UpdatesPage() {
  const viewer = await requireViewer(["school_admin", "teacher", "guardian"]);
  const role = viewer.role as "school_admin" | "teacher" | "guardian";
  const supabase = await createClient();
  const [features, school, branches, classrooms, announcements, events] = await Promise.all([
    supabase.from("school_feature_settings").select("feature_key, is_enabled").eq("school_id", viewer.schoolId!).in("feature_key", ["announcements", "calendar"]),
    supabase.from("schools").select("teachers_can_publish_announcements, teachers_can_manage_calendar").eq("id", viewer.schoolId!).single(),
    supabase.from("branches").select("id, name").eq("status", "active").order("name"),
    supabase.from("classrooms").select("id, name").eq("status", "active").order("name"),
    supabase.from("announcements").select("id, target_scope, branch_id, classroom_id, title, body, priority, status, expires_at, created_by_membership_id").order("publish_at", { ascending: false, nullsFirst: true }).limit(30),
    supabase.from("calendar_events").select("id, target_scope, branch_id, classroom_id, title, description, location, starts_at, ends_at, all_day, status, created_by_membership_id").gte("ends_at", new Date().toISOString()).order("starts_at").limit(50),
  ]);
  const enabled = new Set(features.data?.filter((item) => item.is_enabled).map((item) => item.feature_key));
  const canAnnounce = role === "school_admin" || (role === "teacher" && school.data?.teachers_can_publish_announcements);
  const canCalendar = role === "school_admin" || (role === "teacher" && school.data?.teachers_can_manage_calendar);
  const branchItems = branches.data ?? [];
  const classroomItems = classrooms.data ?? [];
  const classroomName = new Map(classroomItems.map((item) => [item.id, item.name]));
  const branchName = new Map(branchItems.map((item) => [item.id, item.name]));
  const audience = (item: { target_scope: string; branch_id: string | null; classroom_id: string | null }) => item.target_scope === "school" ? "Whole school" : item.target_scope === "branch" ? branchName.get(item.branch_id ?? "") : classroomName.get(item.classroom_id ?? "");

  return <AppShell eyebrow={viewer.schoolName ?? "School"} title="Updates" nav={communicationNavigation(role)} contentWidth="wide">
    {!enabled.has("announcements") && !enabled.has("calendar") ? <StatusNote tone="warning">Announcements and calendar are not enabled for this school.</StatusNote> : null}
    <div className="updates-grid">
      {enabled.has("announcements") ? <section className="section-panel"><div className="section-heading"><div><p className="eyebrow">School communication</p><h2>Announcements</h2></div></div>
        <div className="announcement-list">{announcements.data?.map((announcement) => <article className={`announcement announcement-${announcement.priority}`} key={announcement.id}><div><strong>{announcement.title}</strong><span>{announcement.priority === "important" ? "Important · " : ""}{audience(announcement)}</span></div><p>{announcement.body}</p>{role === "school_admin" ? <small>{announcement.status}</small> : null}{canAnnounce && (role === "school_admin" || announcement.created_by_membership_id === viewer.membershipId) ? <AnnouncementEditor role={role} branches={branchItems} classrooms={classroomItems} timezone={viewer.timezone} item={announcement} /> : null}</article>)}{!announcements.data?.length ? <p className="empty-inline">No current announcements.</p> : null}</div>
        {canAnnounce ? <AnnouncementEditor role={role} branches={branchItems} classrooms={classroomItems} timezone={viewer.timezone} /> : null}
      </section> : null}

      {enabled.has("calendar") ? <section className="section-panel"><div className="section-heading"><div><p className="eyebrow">Upcoming</p><h2>Calendar</h2></div></div>
        <div className="calendar-list">{events.data?.map((event) => <article className="calendar-row" key={event.id}><time>{new Date(event.starts_at).toLocaleDateString("en-LK", { timeZone: viewer.timezone, day: "numeric", month: "short" })}</time><div><strong>{event.title}</strong><span>{event.all_day ? "All day" : `${new Date(event.starts_at).toLocaleTimeString("en-LK", { timeZone: viewer.timezone, hour: "numeric", minute: "2-digit" })}–${new Date(event.ends_at).toLocaleTimeString("en-LK", { timeZone: viewer.timezone, hour: "numeric", minute: "2-digit" })}`}{event.location ? ` · ${event.location}` : ""}</span><small>{audience(event)}</small>{event.description ? <p>{event.description}</p> : null}{canCalendar && (role === "school_admin" || event.created_by_membership_id === viewer.membershipId) ? <CalendarEditor role={role} branches={branchItems} classrooms={classroomItems} timezone={viewer.timezone} item={event} /> : null}</div></article>)}{!events.data?.length ? <p className="empty-inline">No upcoming events.</p> : null}</div>
        {canCalendar ? <CalendarEditor role={role} branches={branchItems} classrooms={classroomItems} timezone={viewer.timezone} /> : null}
      </section> : null}
    </div>
  </AppShell>;
}
