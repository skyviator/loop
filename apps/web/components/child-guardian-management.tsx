"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  createChildAction,
  createInvitationAction,
  linkGuardianAction,
  moveChildEnrollmentAction,
  setMediaConsentAction,
  updateChildAction,
  updateGuardianLinkAction,
} from "@/app/actions/core";

type RecordStatus = "active" | "inactive" | "archived";
type Child = { id: string; preferred_name: string; status: RecordStatus };
type Enrollment = { child_id: string; classroom_id: string; status: "active" | "planned" | "completed" | "cancelled"; starts_on: string; ends_on: string | null };
type Classroom = { id: string; branch_id: string; name: string; status: RecordStatus };
type Branch = { id: string; status: RecordStatus };
type GuardianMembership = { id: string; status: RecordStatus; name: string };
type GuardianLink = { id: string; child_id: string; guardian_membership_id: string; relationship_label: string; is_primary: boolean; status: RecordStatus };
type Consent = { child_id: string; state: "not_recorded" | "granted" | "denied"; changed_at: string };

function SubmitButton({ children, tone = "secondary" }: { children: ReactNode; tone?: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return <button className={`button button-${tone}`} disabled={pending}>{pending ? "Saving…" : children}</button>;
}

function statusLabel(status: RecordStatus) {
  return status === "active" ? "Active" : status === "archived" ? "Archived" : "Inactive";
}

function ChildStatusAction({ child, canReactivate }: { child: Child; canReactivate: boolean }) {
  const [confirming, setConfirming] = useState(false);

  if (child.status !== "active") {
    if (!canReactivate) return <p className="child-action-note">A plan place is needed before this child can be reactivated.</p>;
    return <form action={updateChildAction}>
      <input type="hidden" name="child_id" value={child.id} />
      <input type="hidden" name="preferred_name" value={child.preferred_name} />
      <input type="hidden" name="status" value="active" />
      <SubmitButton>Reactivate child</SubmitButton>
    </form>;
  }

  if (!confirming) {
    return <button type="button" className="button button-danger" onClick={() => setConfirming(true)}>Deactivate child</button>;
  }

  return <div className="management-confirmation" role="group" aria-label="Confirm child deactivation">
    <p>This child will no longer appear in current teacher or family workflows. Existing records will be kept, and the current enrollment remains as history.</p>
    <div className="management-confirmation-actions">
      <form action={updateChildAction}>
        <input type="hidden" name="child_id" value={child.id} />
        <input type="hidden" name="preferred_name" value={child.preferred_name} />
        <input type="hidden" name="status" value="inactive" />
        <SubmitButton tone="danger">Confirm deactivation</SubmitButton>
      </form>
      <button type="button" className="button button-secondary" onClick={() => setConfirming(false)}>Cancel</button>
    </div>
  </div>;
}

function GuardianLinkStatusAction({ link, guardianActive }: { link: GuardianLink; guardianActive: boolean }) {
  const [confirming, setConfirming] = useState(false);

  if (link.status !== "active") {
    if (!guardianActive) return <p className="child-action-note">Reactivate this guardian&apos;s school membership before restoring the link.</p>;
    return <form action={updateGuardianLinkAction}>
      <input type="hidden" name="guardian_link_id" value={link.id} />
      <input type="hidden" name="relationship_label" value={link.relationship_label} />
      <input type="hidden" name="is_primary" value={link.is_primary ? "on" : ""} />
      <input type="hidden" name="status" value="active" />
      <SubmitButton>Restore guardian link</SubmitButton>
    </form>;
  }

  if (!confirming) return <button type="button" className="text-button danger-text" onClick={() => setConfirming(true)}>Revoke link</button>;

  return <div className="management-confirmation" role="group" aria-label="Confirm guardian access revocation">
    <p>This guardian will immediately lose access to this child. Their account and access to any other linked child will not be changed.</p>
    <div className="management-confirmation-actions">
      <form action={updateGuardianLinkAction}>
        <input type="hidden" name="guardian_link_id" value={link.id} />
        <input type="hidden" name="relationship_label" value={link.relationship_label} />
        <input type="hidden" name="is_primary" value={link.is_primary ? "on" : ""} />
        <input type="hidden" name="status" value="inactive" />
        <SubmitButton tone="danger">Confirm revocation</SubmitButton>
      </form>
      <button type="button" className="button button-secondary" onClick={() => setConfirming(false)}>Cancel</button>
    </div>
  </div>;
}

function ClassroomMove({ child, currentClassroom, activeClassrooms }: { child: Child; currentClassroom?: Classroom; activeClassrooms: Classroom[] }) {
  const choices = activeClassrooms.filter((classroom) => classroom.id !== currentClassroom?.id);
  const [classroomId, setClassroomId] = useState(choices[0]?.id ?? "");
  const [confirming, setConfirming] = useState(false);
  const destination = activeClassrooms.find((classroom) => classroom.id === classroomId);

  if (child.status !== "active") return <p className="child-action-note">Reactivate this child before changing the current classroom.</p>;
  if (!choices.length) return <p className="child-action-note">No other active classroom is available.</p>;

  if (confirming && destination) {
    return <div className="management-confirmation" role="group" aria-label="Confirm classroom move">
      <p>{currentClassroom ? `Move ${child.preferred_name} from ${currentClassroom.name} to ${destination.name}? The existing enrollment will be completed and kept as history.` : `Enrol ${child.preferred_name} in ${destination.name}?`}</p>
      <div className="management-confirmation-actions">
        <form action={moveChildEnrollmentAction}>
          <input type="hidden" name="child_id" value={child.id} />
          <input type="hidden" name="classroom_id" value={destination.id} />
          <SubmitButton tone="primary">Confirm {currentClassroom ? "move" : "enrollment"}</SubmitButton>
        </form>
        <button type="button" className="button button-secondary" onClick={() => setConfirming(false)}>Cancel</button>
      </div>
    </div>;
  }

  return <div className="classroom-move-controls">
    <label className="field"><span>{currentClassroom ? "New classroom" : "Classroom"}</span><select value={classroomId} onChange={(event) => { setClassroomId(event.target.value); setConfirming(false); }}>{choices.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}</select></label>
    <button type="button" className="button button-secondary" disabled={!destination} onClick={() => setConfirming(true)}>Review {currentClassroom ? "move" : "enrollment"}</button>
  </div>;
}

function ChildProfile({ child, currentEnrollment, activeClassrooms, classroomById, guardianLinks, guardianById, consent, childLimitReached }: {
  child: Child;
  currentEnrollment?: Enrollment;
  activeClassrooms: Classroom[];
  classroomById: Map<string, Classroom>;
  guardianLinks: GuardianLink[];
  guardianById: Map<string, GuardianMembership>;
  consent?: Consent;
  childLimitReached: boolean;
}) {
  const currentClassroom = currentEnrollment ? classroomById.get(currentEnrollment.classroom_id) : undefined;
  const [mediaState, setMediaState] = useState(consent?.state ?? "not_recorded");
  const linkedMemberships = new Set(guardianLinks.map((link) => link.guardian_membership_id));
  const availableGuardians = [...guardianById.values()].filter((guardian) => guardian.status === "active" && !linkedMemberships.has(guardian.id));

  return <div className="child-profile" aria-labelledby={`child-${child.id}`}>
    <div className="child-profile-heading">
      <div><p className="eyebrow">Child profile</p><h3 id={`child-${child.id}`}>{child.preferred_name}</h3><p>{currentClassroom?.name ?? "Not currently enrolled"}</p></div>
      <span className="structure-status" data-status={child.status}>{statusLabel(child.status)}</span>
    </div>

    <section className="child-profile-section" aria-labelledby={`profile-${child.id}`}>
      <h4 id={`profile-${child.id}`}>Profile and status</h4>
      <form action={updateChildAction} className="form-stack child-compact-form">
        <input type="hidden" name="child_id" value={child.id} />
        <input type="hidden" name="status" value={child.status} />
        <label className="field"><span>Preferred name</span><input name="preferred_name" defaultValue={child.preferred_name} required maxLength={80} /></label>
        <SubmitButton>Save name</SubmitButton>
      </form>
      <ChildStatusAction child={child} canReactivate={!childLimitReached} />
    </section>

    <section className="child-profile-section" aria-labelledby={`classroom-${child.id}`}>
      <h4 id={`classroom-${child.id}`}>Classroom</h4>
      <p className="child-section-summary"><strong>Current:</strong> {currentClassroom?.name ?? "Not enrolled"}</p>
      <ClassroomMove child={child} currentClassroom={currentClassroom} activeClassrooms={activeClassrooms} />
    </section>

    <section className="child-profile-section" aria-labelledby={`guardians-${child.id}`}>
      <div className="child-section-heading"><h4 id={`guardians-${child.id}`}>Guardians</h4><span>{guardianLinks.filter((link) => link.status === "active").length} linked</span></div>
      <div className="guardian-link-list">
        {guardianLinks.map((link) => {
          const guardian = guardianById.get(link.guardian_membership_id);
          return <article className="guardian-link" key={link.id}>
            <div className="guardian-link-heading"><div><strong>{guardian?.name ?? "Guardian"}</strong><span>{link.relationship_label}{link.is_primary ? " · Primary" : ""}</span></div><span>{statusLabel(link.status)}</span></div>
            <details className="compact-editor"><summary>Edit guardian link</summary>
              <form action={updateGuardianLinkAction} className="form-stack">
                <input type="hidden" name="guardian_link_id" value={link.id} />
                <input type="hidden" name="status" value={link.status} />
                <label className="field"><span>Relationship</span><input name="relationship_label" defaultValue={link.relationship_label} required maxLength={50} /></label>
                <label className="check-field"><input type="checkbox" name="is_primary" defaultChecked={link.is_primary} /> Primary guardian</label>
                <SubmitButton>Save guardian details</SubmitButton>
              </form>
            </details>
            <GuardianLinkStatusAction link={link} guardianActive={guardian?.status === "active"} />
          </article>;
        })}
        {!guardianLinks.length ? <p className="child-empty-state">No guardians are linked to this child yet.</p> : null}
      </div>

      <details className="compact-editor"><summary>Link an existing guardian</summary>
        {availableGuardians.length ? <form action={linkGuardianAction} className="form-stack child-compact-form">
          <input type="hidden" name="child_id" value={child.id} />
          <label className="field"><span>Guardian</span><select name="guardian_membership_id">{availableGuardians.map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.name}</option>)}</select></label>
          <label className="field"><span>Relationship</span><input name="relationship_label" defaultValue="Parent" required maxLength={50} /></label>
          <label className="check-field"><input type="checkbox" name="is_primary" /> Primary guardian</label>
          <SubmitButton tone="primary">Link guardian</SubmitButton>
        </form> : <p className="child-action-note">No unlinked active guardian identity is available. Create an invitation below for a new guardian.</p>}
      </details>

      <details className="compact-editor"><summary>Invite a new guardian</summary>
        <form action={createInvitationAction} className="form-stack child-compact-form">
          <input type="hidden" name="role" value="guardian" />
          <label className="field"><span>Email</span><input type="email" name="email" required /></label>
          <p className="child-action-note">This creates an invitation record only. Production email delivery is not configured; link the guardian after their invitation is activated.</p>
          <SubmitButton>Create guardian invitation</SubmitButton>
        </form>
      </details>
    </section>

    <section className="child-profile-section" aria-labelledby={`consent-${child.id}`}>
      <h4 id={`consent-${child.id}`}>Media consent</h4>
      <p className="child-action-note">Not recorded and denied both prevent staff from tagging this child in private photos.</p>
      <form action={setMediaConsentAction} className="consent-row child-profile-consent">
        <input type="hidden" name="child_id" value={child.id} />
        <span><strong>Photo use</strong><small>Last changed {consent ? new Date(consent.changed_at).toLocaleDateString("en-LK") : "never"}</small></span>
        <select aria-label={`Media consent for ${child.preferred_name}`} name="state" value={mediaState} onChange={(event) => setMediaState(event.target.value as Consent["state"])}><option value="not_recorded">Not recorded</option><option value="granted">Granted</option><option value="denied">Denied</option></select>
        <SubmitButton>Save consent</SubmitButton>
      </form>
    </section>
  </div>;
}

export function ChildGuardianManagement({ roster, enrollments, classrooms, branches, guardians, guardianLinks, consents, today, childLimitReached }: {
  roster: Child[];
  enrollments: Enrollment[];
  classrooms: Classroom[];
  branches: Branch[];
  guardians: GuardianMembership[];
  guardianLinks: GuardianLink[];
  consents: Consent[];
  today: string;
  childLimitReached: boolean;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(roster[0]?.id ?? "");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredChildren = normalizedQuery ? roster.filter((child) => child.preferred_name.toLocaleLowerCase().includes(normalizedQuery)) : roster;
  const selectedChild = normalizedQuery
    ? filteredChildren.find((child) => child.id === selectedId) ?? filteredChildren[0]
    : roster.find((child) => child.id === selectedId) ?? roster[0];
  const relationships = useMemo(() => {
    const activeBranchIds = new Set(branches.filter((branch) => branch.status === "active").map((branch) => branch.id));
    const activeClassrooms = classrooms.filter((classroom) => classroom.status === "active" && activeBranchIds.has(classroom.branch_id));
    const classroomById = new Map(classrooms.map((classroom) => [classroom.id, classroom]));
    const currentEnrollmentByChild = new Map(enrollments.filter((enrollment) => enrollment.status === "active" && enrollment.starts_on <= today && (!enrollment.ends_on || enrollment.ends_on >= today)).map((enrollment) => [enrollment.child_id, enrollment]));
    const guardianLinksByChild = new Map<string, GuardianLink[]>();
    for (const link of guardianLinks) guardianLinksByChild.set(link.child_id, [...(guardianLinksByChild.get(link.child_id) ?? []), link]);
    return {
      activeClassrooms,
      classroomById,
      currentEnrollmentByChild,
      guardianById: new Map(guardians.map((guardian) => [guardian.id, guardian])),
      guardianLinksByChild,
      consentByChild: new Map(consents.map((consent) => [consent.child_id, consent])),
    };
  }, [branches, classrooms, consents, enrollments, guardianLinks, guardians, today]);

  return <section id="people" className="section-panel span-two child-management">
    <div className="section-heading"><div><p className="eyebrow">People</p><h2>Children and guardians</h2></div><span className="count-label">{roster.filter((child) => child.status === "active").length} active</span></div>
    <div className="child-management-layout">
      <div className="child-roster">
        <label className="field" htmlFor={searchId}><span>Search children</span><input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by preferred name" /></label>
        <div className="child-roster-list" aria-label="Children">
          {filteredChildren.map((child) => {
            const enrollment = relationships.currentEnrollmentByChild.get(child.id);
            const classroom = enrollment ? relationships.classroomById.get(enrollment.classroom_id) : undefined;
            const linkedCount = (relationships.guardianLinksByChild.get(child.id) ?? []).filter((link) => link.status === "active").length;
            return <button type="button" className="child-roster-item" data-selected={child.id === selectedChild?.id} aria-pressed={child.id === selectedChild?.id} onClick={() => setSelectedId(child.id)} key={child.id}>
              <strong>{child.preferred_name}</strong>
              <span>{statusLabel(child.status)} · {classroom?.name ?? "Not enrolled"}</span>
              <small>{linkedCount} {linkedCount === 1 ? "guardian" : "guardians"}</small>
            </button>;
          })}
          {!filteredChildren.length ? <p className="child-empty-state">No children match “{query.trim()}”.</p> : null}
        </div>
        <details className="compact-editor child-create" open={!roster.length}><summary>Add and enrol child</summary>
          {childLimitReached ? <p className="status-note status-warning">No active-child places remain on this plan.</p> : relationships.activeClassrooms.length ? <form action={createChildAction} className="form-stack">
            <label className="field"><span>Preferred name</span><input name="preferred_name" required maxLength={80} /></label>
            <label className="field"><span>Initial classroom</span><select name="classroom_id">{relationships.activeClassrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}</select></label>
            <p className="child-action-note">The child and current enrollment are created together. If either fails, neither is kept.</p>
            <SubmitButton tone="primary">Add child</SubmitButton>
          </form> : <p className="child-action-note">Create or reactivate a branch and classroom before adding a child.</p>}
        </details>
      </div>

      {selectedChild ? <ChildProfile
        key={selectedChild.id}
        child={selectedChild}
        currentEnrollment={relationships.currentEnrollmentByChild.get(selectedChild.id)}
        activeClassrooms={relationships.activeClassrooms}
        classroomById={relationships.classroomById}
        guardianLinks={relationships.guardianLinksByChild.get(selectedChild.id) ?? []}
        guardianById={relationships.guardianById}
        consent={relationships.consentByChild.get(selectedChild.id)}
        childLimitReached={childLimitReached}
      /> : <div className="child-empty-profile"><strong>{roster.length ? "No matching child" : "Add the first child"}</strong><span>{roster.length ? "Try another preferred name." : "Their profile and guardian links will appear here."}</span></div>}
    </div>
  </section>;
}
