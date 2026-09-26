"use client";

import { useId, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  assignStaffAction,
  createStaffInvitationAction,
  reissueInvitationAction,
  revokeInvitationAction,
  updateAssignmentAction,
  updateMembershipAction,
} from "@/app/actions/core";

type Status = "active" | "inactive" | "archived";
type Staff = { id: string; name: string; role: "teacher" | "school_admin"; status: Status };
type Classroom = { id: string; name: string; status: Status; branchActive: boolean };
type Assignment = { id: string; membership_id: string; classroom_id: string; status: Status; starts_on: string; ends_on: string | null };
type Invitation = { id: string; invited_email: string; invited_role: "teacher" | "school_admin"; status: "pending" | "accepted" | "revoked" | "expired"; expires_at: string; delivery_status: "not_sent" | "sent" | "failed"; delivery_attempt_count: number };

function SubmitButton({ children, tone = "secondary" }: { children: ReactNode; tone?: "secondary" | "danger" | "accent" }) {
  const { pending } = useFormStatus();
  return <button className={`button button-${tone}`} disabled={pending}>{pending ? "Saving…" : children}</button>;
}

function StaffStatusAction({ staff, activeAssignmentCount }: { staff: Staff; activeAssignmentCount: number }) {
  const [confirming, setConfirming] = useState(false);

  if (staff.status !== "active") return <div className="staff-access-action">
    {staff.role === "teacher" ? <p className="staff-note">{activeAssignmentCount ? `Reactivation can resume access through ${activeAssignmentCount} currently eligible assignment ${activeAssignmentCount === 1 ? "row" : "rows"}.` : "There are no currently eligible classroom assignment rows."} It does not create or restore inactive assignments.</p> : null}
    <form action={updateMembershipAction}>
      <input type="hidden" name="membership_id" value={staff.id} />
      <input type="hidden" name="status" value="active" />
      <SubmitButton>Reactivate school access</SubmitButton>
    </form>
  </div>;

  if (!confirming) return <button type="button" className="button button-danger" onClick={() => setConfirming(true)}>Deactivate school access</button>;

  return <div className="management-confirmation" role="group" aria-label={`Confirm ${staff.name} school access deactivation`}>
    <p>{staff.name} will lose access to Loop for this school. Existing records and classroom assignment history will be kept.{staff.role === "school_admin" ? " An active school must retain another active School Admin." : ""}</p>
    <div className="management-confirmation-actions">
      <form action={updateMembershipAction}>
        <input type="hidden" name="membership_id" value={staff.id} />
        <input type="hidden" name="status" value="inactive" />
        <SubmitButton tone="danger">Confirm deactivation</SubmitButton>
      </form>
      <button type="button" className="button button-secondary" onClick={() => setConfirming(false)}>Cancel</button>
    </div>
  </div>;
}

function AssignmentStatusAction({ assignment, classroom, teacherActive }: { assignment: Assignment; classroom?: Classroom; teacherActive: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const canRestore = teacherActive && classroom?.status === "active" && classroom.branchActive;

  if (assignment.status === "archived") return <p className="staff-note">Archived assignment retained as history.</p>;
  if (assignment.status === "inactive") return canRestore ? <form action={updateAssignmentAction}>
    <input type="hidden" name="assignment_id" value={assignment.id} />
    <input type="hidden" name="status" value="active" />
    <SubmitButton>Restore assignment</SubmitButton>
  </form> : <p className="staff-note">Reactivate the Teacher and classroom before restoring this assignment.</p>;

  if (!confirming) return <button type="button" className="button button-secondary" onClick={() => setConfirming(true)}>Remove access</button>;
  return <div className="management-confirmation" role="group" aria-label={`Confirm ${classroom?.name ?? "classroom"} assignment removal`}>
    <p>Remove this classroom assignment? Teacher access through this assignment ends immediately. The history row is kept.</p>
    <div className="management-confirmation-actions">
      <form action={updateAssignmentAction}>
        <input type="hidden" name="assignment_id" value={assignment.id} />
        <input type="hidden" name="status" value="inactive" />
        <SubmitButton tone="danger">Confirm removal</SubmitButton>
      </form>
      <button type="button" className="button button-secondary" onClick={() => setConfirming(false)}>Cancel</button>
    </div>
  </div>;
}

function StaffRow({ staff, assignments, classrooms, today }: { staff: Staff; assignments: Assignment[]; classrooms: Classroom[]; today: string }) {
  const classroomById = new Map(classrooms.map((room) => [room.id, room]));
  const eligibleAssignments = assignments.filter((assignment) => {
    const room = classroomById.get(assignment.classroom_id);
    return assignment.status === "active" && assignment.starts_on <= today && (!assignment.ends_on || assignment.ends_on >= today)
      && room?.status === "active" && room.branchActive;
  });
  const selectable = classrooms.filter((room) => room.status === "active" && room.branchActive && !assignments.some((assignment) => assignment.classroom_id === room.id));

  return <details className="management-row staff-row" data-staff-id={staff.id}>
    <summary><strong>{staff.name}</strong><span>{staff.role === "teacher" ? "Teacher" : "School Admin"} · {staff.status === "active" ? "Active" : staff.status === "archived" ? "Archived" : "Inactive"}{staff.role === "teacher" ? ` · ${staff.status === "active" ? eligibleAssignments.length : 0} current classroom ${eligibleAssignments.length === 1 ? "assignment" : "assignments"}` : ""}</span></summary>
    <div className="staff-details">
      <StaffStatusAction staff={staff} activeAssignmentCount={eligibleAssignments.length} />
      {staff.role === "teacher" ? <section aria-label={`${staff.name} classroom assignments`} className="staff-assignment-section">
        <h3>Classroom assignments</h3>
        {assignments.length ? <div className="staff-assignment-list">{assignments.map((assignment) => {
          const room = classroomById.get(assignment.classroom_id);
          return <div className="staff-assignment-row" key={assignment.id}>
            <div><strong>{room?.name ?? "Previous classroom"}</strong><small>{assignment.status === "active" ? staff.status === "active" && eligibleAssignments.includes(assignment) ? "Assigned" : "Recorded active · no current access" : assignment.status === "inactive" ? "Removed" : "Archived"} · From {assignment.starts_on}{assignment.ends_on ? ` to ${assignment.ends_on}` : ""}</small></div>
            <AssignmentStatusAction assignment={assignment} classroom={room} teacherActive={staff.status === "active"} />
          </div>;
        })}</div> : <p className="staff-note">No classroom assignments yet. This Teacher cannot access classroom records until assigned.</p>}
        {staff.status === "active" && selectable.length ? <form action={assignStaffAction} className="staff-assign-form">
          <input type="hidden" name="membership_id" value={staff.id} />
          <label className="field"><span>Assign to active classroom</span><select name="classroom_id" required>{selectable.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
          <SubmitButton>Assign classroom</SubmitButton>
        </form> : staff.status !== "active" ? <p className="staff-note">Reactivate school access before adding an assignment. Existing active rows may resume access on reactivation.</p> : !classrooms.some((room) => room.status === "active" && room.branchActive) ? <p className="staff-note">Create an active branch and classroom before assigning a Teacher.</p> : !assignments.length ? <p className="staff-note">No available classroom can be selected.</p> : null}
      </section> : null}
    </div>
  </details>;
}

export function StaffManagement({ staff, classrooms, assignments, invitations, clock, today }: {
  staff: Staff[]; classrooms: Classroom[]; assignments: Assignment[]; invitations: Invitation[]; clock: string; today: string;
}) {
  const searchId = useId();
  const [search, setSearch] = useState("");
  const classroomById = new Map(classrooms.map((room) => [room.id, room]));
  const assignmentsByMember = new Map<string, Assignment[]>();
  for (const assignment of assignments) assignmentsByMember.set(assignment.membership_id, [...(assignmentsByMember.get(assignment.membership_id) ?? []), assignment]);
  const term = search.trim().toLocaleLowerCase();
  const visible = staff.filter((member) => {
    const assignedRooms = (assignmentsByMember.get(member.id) ?? []).map((assignment) => classroomById.get(assignment.classroom_id)?.name ?? "");
    return !term || [member.name, member.role.replace("_", " "), member.status, ...assignedRooms].some((value) => value.toLocaleLowerCase().includes(term));
  });
  const staffInvites = invitations.filter((invite) => invite.invited_role === "teacher" || invite.invited_role === "school_admin");

  return <>
    <section id="staff" className="section-panel staff-management">
      <div className="section-heading"><div><p className="eyebrow">Access management</p><h2>Staff</h2></div><span className="staff-count">{staff.length} members</span></div>
      {staff.length ? <>
        <label className="field staff-search" htmlFor={searchId}><span>Search staff</span><input id={searchId} value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Name, role or classroom" autoComplete="off" /></label>
        <div className="staff-roster">{visible.map((member) => <StaffRow key={member.id} staff={member} assignments={assignmentsByMember.get(member.id) ?? []} classrooms={classrooms} today={today} />)}</div>
        {!visible.length ? <p className="staff-note" role="status">No staff match this search.</p> : null}
      </> : <p className="staff-note"><strong>No staff added yet.</strong> <a className="text-link" href="#staff-invitations">Create a staff invitation</a> to get started.</p>}
    </section>
    <section id="staff-invitations" className="section-panel staff-invitations">
      <div className="section-heading"><h2>Staff invitations</h2></div>
      <p className="staff-note">Send a seven-day invitation to a Teacher or School Admin. Failed delivery remains visible and can be safely reissued.</p>
      <form action={createStaffInvitationAction} className="form-stack">
        <label className="field"><span>Email</span><input type="email" name="email" required autoComplete="email" /></label>
        <label className="field"><span>Staff role</span><select name="role"><option value="teacher">Teacher</option><option value="school_admin">School Admin</option></select></label>
        <SubmitButton tone="accent">Create staff invitation</SubmitButton>
      </form>
      <div className="staff-invitation-list">{staffInvites.map((invite) => {
        const lifecycle = invite.status === "expired" || invite.status === "pending" && invite.expires_at <= clock ? "Expired" : invite.status === "pending" ? "Pending" : invite.status === "accepted" ? "Activated" : "Revoked";
        const delivery = invite.delivery_status === "sent" ? "Email accepted" : invite.delivery_status === "failed" ? "Delivery failed" : "Not sent";
        return <div className="person-row staff-invitation-row" key={invite.id}>
          <span className="break-all">{invite.invited_email}<small>{invite.invited_role === "teacher" ? "Teacher" : "School Admin"} · {lifecycle} · {delivery}{invite.delivery_attempt_count ? ` · ${invite.delivery_attempt_count} attempt` : ""}</small></span>
          <div className="inline-actions">
            {(invite.status === "pending" || invite.status === "expired") ? <form action={reissueInvitationAction}><input type="hidden" name="invitation_id" value={invite.id} /><SubmitButton>Reissue</SubmitButton></form> : null}
            {invite.status === "pending" ? <form action={revokeInvitationAction}><input type="hidden" name="invitation_id" value={invite.id} /><SubmitButton>Revoke</SubmitButton></form> : null}
          </div>
        </div>;
      })}</div>
      {!staffInvites.length ? <p className="staff-note">No staff invitations yet.</p> : null}
    </section>
  </>;
}
