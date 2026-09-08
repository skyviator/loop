import { AppShell, Stat, StatusNote } from "@/components/app-shell";
import { createBranchAction, createClassroomAction, createInvitationAction, createSchoolAction, setFeatureAction, setPlanFeatureAction, updatePlanAction, updateSchoolPlatformAction } from "@/app/actions/core";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const nav = [
  { href: "/platform", label: "Schools", icon: "building" as const },
  { href: "/platform#plans", label: "Plans", icon: "note" as const },
  { href: "/platform#features", label: "Features", icon: "settings" as const },
  { href: "/platform#audit", label: "Audit", icon: "clock" as const },
];

export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ school?: string; invite?: string }> }) {
  await requireViewer(["super_admin"]);
  const state = await searchParams;
  const supabase = await createClient();
  const [schools, plans, features, planFeatures, schoolSettings, branches, classrooms, invitations, audit] = await Promise.all([
    supabase.from("schools").select("id, name, slug, plan_id, status, timezone, teachers_can_manage_timetable").order("name"),
    supabase.from("plans").select("id, label, max_active_children, max_staff, storage_allowance_bytes, status").order("label"),
    supabase.from("feature_catalogue").select("key, label, category").order("category").order("label"),
    supabase.from("plan_features").select("plan_id, feature_key, is_allowed"),
    supabase.from("school_feature_settings").select("school_id, feature_key, is_enabled"),
    supabase.from("branches").select("id, school_id, name, status").order("name"),
    supabase.from("classrooms").select("id, school_id, branch_id, name, status").order("name"),
    supabase.from("invitations").select("id, school_id, invited_email, status, expires_at").eq("invited_role", "school_admin").order("created_at", { ascending: false }),
    supabase.from("audit_log").select("id, occurred_at, action, entity_table, school_id").order("occurred_at", { ascending: false }).limit(8),
  ]);
  const selected = schools.data?.find((school) => school.id === state.school) ?? schools.data?.[0] ?? null;
  const plan = plans.data?.find((item) => item.id === selected?.plan_id);
  const selectedBranches = branches.data?.filter((branch) => branch.school_id === selected?.id) ?? [];
  const selectedClassrooms = classrooms.data?.filter((room) => room.school_id === selected?.id) ?? [];
  const selectedInvites = invitations.data?.filter((invite) => invite.school_id === selected?.id) ?? [];
  const planAllows = new Map(planFeatures.data?.filter((item) => item.plan_id === plan?.id).map((item) => [item.feature_key, item.is_allowed]));
  const schoolEnabled = new Map(schoolSettings.data?.filter((item) => item.school_id === selected?.id).map((item) => [item.feature_key, item.is_enabled]));

  return (
    <AppShell eyebrow="Loop administration" title="Schools" nav={nav}>
      <StatusNote>Platform setup excludes child, attendance, and care data by design.</StatusNote>
      {state.invite ? <StatusNote tone="success">Local-only invite URL: <a className="text-link break-all" href={state.invite}>{state.invite}</a></StatusNote> : null}
      <div className="split-layout">
        <section className="section-panel">
          <div className="section-heading"><div><p className="eyebrow">Organisation</p><h2>Schools</h2></div><span className="count-label">{schools.data?.length ?? 0} total</span></div>
          <div className="list-table">
            {schools.data?.map((school) => <a key={school.id} className={`list-row ${selected?.id === school.id ? "selected" : ""}`} href={`/platform?school=${school.id}`}><span><strong>{school.name}</strong><small>{school.slug}</small></span><span>{school.status}</span></a>)}
            {!schools.data?.length ? <p className="empty-state">No schools yet. Add the first school below.</p> : null}
          </div>
          <details className="editor"><summary>Add school</summary><form action={createSchoolAction} className="form-grid"><label className="field"><span>Name</span><input name="name" required /></label><label className="field"><span>Identifier</span><input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></label><label className="field"><span>Plan</span><select name="plan_id" required>{plans.data?.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button className="button button-primary" type="submit">Create school</button></form></details>
        </section>
        <section className="section-panel">
          {selected ? <>
            <div className="section-heading"><div><p className="eyebrow">Selected school</p><h2>{selected.name}</h2></div><span className="status-dot">{selected.status}</span></div>
            <div className="stats-line"><Stat value={selectedBranches.length} label="branches" /><Stat value={selectedClassrooms.length} label="classrooms" /><Stat value={selectedInvites.filter((item) => item.status === "pending").length} label="pending admin invites" /></div>
            <div className="detail-block"><h3>School settings</h3><form action={updateSchoolPlatformAction} className="form-grid"><input type="hidden" name="school_id" value={selected.id} /><label className="field"><span>Name</span><input name="name" defaultValue={selected.name} required /></label><label className="field"><span>Timezone</span><input name="timezone" defaultValue={selected.timezone} required /></label><label className="field"><span>Plan</span><select name="plan_id" defaultValue={selected.plan_id}>{plans.data?.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="field"><span>Status</span><select name="status" defaultValue={selected.status}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label><button className="button button-secondary">Save school settings</button></form></div>
            {plan ? <div id="plans" className="detail-block"><h3>{plan.label} limits</h3><form action={updatePlanAction} className="form-grid"><input type="hidden" name="plan_id" value={plan.id} /><label className="field"><span>Maximum active children</span><input type="number" min="1" name="max_active_children" defaultValue={plan.max_active_children} required /></label><label className="field"><span>Maximum staff</span><input type="number" min="1" name="max_staff" defaultValue={plan.max_staff} required /></label><label className="field"><span>Storage allowance (GB)</span><input type="number" min="0" step="0.1" name="storage_gb" defaultValue={Math.round(plan.storage_allowance_bytes / 1024 / 1024 / 102.4) / 10} required /></label><button className="button button-secondary">Save plan limits</button></form><p className="muted">Plan changes affect every school assigned to this plan.</p></div> : null}
            <div className="detail-block"><h3>Starter structure</h3>{selectedBranches.map((branch) => <div className="structure-row" key={branch.id}><strong>{branch.name}</strong><span>{selectedClassrooms.filter((room) => room.branch_id === branch.id).map((room) => room.name).join(", ") || "No classrooms"}</span></div>)}
              <div className="inline-editors"><details className="editor"><summary>Add branch</summary><form action={createBranchAction} className="form-stack"><input type="hidden" name="school_id" value={selected.id} /><label className="field"><span>Branch name</span><input name="name" required /></label><button className="button button-secondary" type="submit">Add branch</button></form></details><details className="editor"><summary>Add classroom</summary><form action={createClassroomAction} className="form-stack"><input type="hidden" name="school_id" value={selected.id} /><label className="field"><span>Branch</span><select name="branch_id">{selectedBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label className="field"><span>Classroom name</span><input name="name" required /></label><button className="button button-secondary" type="submit">Add classroom</button></form></details></div>
            </div>
            <div className="detail-block"><h3>First administrator</h3><form action={createInvitationAction} className="form-grid"><input type="hidden" name="school_id" value={selected.id} /><input type="hidden" name="role" value="school_admin" /><label className="field"><span>Email</span><input name="email" type="email" required /></label><button className="button button-accent" type="submit">Create invitation</button></form>{selectedInvites.map((invite) => <p className="meta" key={invite.id}>{invite.invited_email} · {invite.status}</p>)}</div>
            <div id="features" className="detail-block"><h3>Feature availability</h3><p className="muted">First include a feature in {plan?.label ?? "the plan"}; then choose whether this school has it enabled.</p><div className="feature-entitlement-head"><span>Feature</span><span>In plan</span><span>School enabled</span></div><div className="feature-list">{features.data?.map((feature) => { const allowed = planAllows.get(feature.key) ?? false; return <div className="feature-entitlement-row" key={feature.key}><span><strong>{feature.label}</strong><small>{feature.category}</small></span>{plan ? <form action={setPlanFeatureAction}><input type="hidden" name="plan_id" value={plan.id} /><input type="hidden" name="feature_key" value={feature.key} /><label className="check-field"><input aria-label={`${feature.label} included in plan`} type="checkbox" name="allowed" defaultChecked={allowed} /> Included</label><button className="text-button">Save</button></form> : <span>Unavailable</span>}<form action={setFeatureAction}><input type="hidden" name="school_id" value={selected.id} /><input type="hidden" name="feature_key" value={feature.key} /><label className="check-field"><input aria-label={`${feature.label} enabled for school`} type="checkbox" name="enabled" defaultChecked={schoolEnabled.get(feature.key) ?? false} disabled={!allowed} /> Enabled</label><button className="text-button" disabled={!allowed}>Save</button></form></div>; })}</div></div>
          </> : <p className="empty-state">Select or create a school to configure it.</p>}
        </section>
      </div>
      <section id="audit" className="section-panel"><div className="section-heading"><h2>Audit trail</h2></div><div className="list-table">{audit.data?.map((item) => <div className="list-row" key={item.id}><span><strong>{item.action}</strong><small>{item.entity_table}</small></span><time>{new Date(item.occurred_at).toLocaleString("en-LK")}</time></div>)}</div></section>
    </AppShell>
  );
}
