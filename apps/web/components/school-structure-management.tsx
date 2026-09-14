import { createBranchAction, createClassroomAction, updateBranchAction, updateClassroomAction } from "@/app/actions/core";

import { StructureStatusAction } from "./structure-status-action";

type RecordStatus = "active" | "inactive" | "archived";
type Branch = { id: string; name: string; status: RecordStatus };
type Classroom = { id: string; branch_id: string; name: string; status: RecordStatus };
type Assignment = { classroom_id: string; status: RecordStatus; starts_on: string; ends_on: string | null };
type Enrollment = { classroom_id: string; status: "active" | "planned" | "completed" | "cancelled"; starts_on: string; ends_on: string | null };

function statusLabel(status: RecordStatus) {
  return status === "active" ? "Active" : status === "archived" ? "Archived" : "Inactive";
}

function isCurrent(item: { status: string; starts_on: string; ends_on: string | null }, today: string) {
  return item.status === "active" && item.starts_on <= today && (!item.ends_on || item.ends_on >= today);
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function SchoolStructureManagement({ branches, classrooms, assignments, enrollments, today }: {
  branches: Branch[];
  classrooms: Classroom[];
  assignments: Assignment[];
  enrollments: Enrollment[];
  today: string;
}) {
  const activeBranches = branches.filter((branch) => branch.status === "active");
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const classroomCounts = new Map<string, { active: number; total: number }>();
  const teacherCounts = new Map<string, number>();
  const childCounts = new Map<string, number>();

  for (const classroom of classrooms) {
    const counts = classroomCounts.get(classroom.branch_id) ?? { active: 0, total: 0 };
    counts.total += 1;
    if (classroom.status === "active") counts.active += 1;
    classroomCounts.set(classroom.branch_id, counts);
  }
  for (const assignment of assignments) {
    if (isCurrent(assignment, today)) teacherCounts.set(assignment.classroom_id, (teacherCounts.get(assignment.classroom_id) ?? 0) + 1);
  }
  for (const enrollment of enrollments) {
    if (isCurrent(enrollment, today)) childCounts.set(enrollment.classroom_id, (childCounts.get(enrollment.classroom_id) ?? 0) + 1);
  }

  return <section id="classrooms" className="section-panel span-two school-structure">
    <div className="section-heading"><div><p className="eyebrow">Structure</p><h2>Branches and classrooms</h2></div></div>
    <div className="structure-sections">
      <section aria-labelledby="branches-heading" className="structure-section">
        <div className="structure-section-heading">
          <div><h3 id="branches-heading">Branches</h3><p>Locations where your classrooms belong.</p></div>
          <span>{activeBranches.length} active</span>
        </div>
        <div className="structure-list">
          {branches.map((branch) => {
            const counts = classroomCounts.get(branch.id) ?? { active: 0, total: 0 };
            return <article className="structure-item" data-structure-kind="branch" key={branch.id}>
              <div className="structure-item-heading">
                <div><h4>{branch.name}</h4><p>{countLabel(counts.total, "classroom")}{counts.total !== counts.active ? ` · ${counts.active} active` : ""}</p></div>
                <span className="structure-status" data-status={branch.status}>{statusLabel(branch.status)}</span>
              </div>
              <div className="structure-item-actions">
                <details className="structure-editor"><summary>Edit branch</summary>
                  <form action={updateBranchAction} className="form-stack">
                    <input type="hidden" name="branch_id" value={branch.id} />
                    <input type="hidden" name="status" value={branch.status} />
                    <label className="field"><span>Branch name</span><input name="name" defaultValue={branch.name} required maxLength={120} /></label>
                    <button className="button button-secondary">Save branch</button>
                  </form>
                </details>
                <StructureStatusAction kind="branch" id={branch.id} name={branch.name} status={branch.status} />
              </div>
            </article>;
          })}
          {!branches.length ? <p className="structure-empty"><strong>Create your first branch</strong><span>A branch is needed before you can add classrooms.</span></p> : null}
        </div>
        <details className="editor structure-create" open={!branches.length}><summary>Create branch</summary>
          <form action={createBranchAction} className="form-stack"><label className="field"><span>Branch name</span><input name="name" required maxLength={120} /></label><button className="button button-primary">Create branch</button></form>
        </details>
      </section>

      <section aria-labelledby="classrooms-heading" className="structure-section">
        <div className="structure-section-heading">
          <div><h3 id="classrooms-heading">Classrooms</h3><p>Teaching groups and their current relationships.</p></div>
          <span>{classrooms.filter((classroom) => classroom.status === "active").length} active</span>
        </div>
        <div className="structure-list">
          {classrooms.map((classroom) => {
            const branch = branchById.get(classroom.branch_id);
            const editBranches = branch && branch.status !== "active" ? [branch, ...activeBranches] : activeBranches;
            return <article className="structure-item" data-structure-kind="classroom" key={classroom.id}>
              <div className="structure-item-heading">
                <div><h4>{classroom.name}</h4><p>{branch?.name ?? "Branch unavailable"}{branch?.status !== "active" ? " · branch inactive" : ""}</p></div>
                <span className="structure-status" data-status={classroom.status}>{statusLabel(classroom.status)}</span>
              </div>
              <p className="structure-context">{countLabel(teacherCounts.get(classroom.id) ?? 0, "active teacher")} · {countLabel(childCounts.get(classroom.id) ?? 0, "current child", "current children")}</p>
              <div className="structure-item-actions">
                <details className="structure-editor"><summary>Edit classroom</summary>
                  <form action={updateClassroomAction} className="form-stack">
                    <input type="hidden" name="classroom_id" value={classroom.id} />
                    <input type="hidden" name="status" value={classroom.status} />
                    <label className="field"><span>Classroom name</span><input name="name" defaultValue={classroom.name} required maxLength={120} /></label>
                    <label className="field"><span>Branch</span><select name="branch_id" defaultValue={classroom.branch_id}>{editBranches.map((option) => <option key={option.id} value={option.id}>{option.name}{option.status !== "active" ? " (inactive)" : ""}</option>)}</select></label>
                    <p className="structure-form-help">A classroom can be moved to any active branch.</p>
                    <button className="button button-secondary">Save classroom</button>
                  </form>
                </details>
                <StructureStatusAction kind="classroom" id={classroom.id} name={classroom.name} branchId={classroom.branch_id} branchActive={branch?.status === "active"} status={classroom.status} />
              </div>
            </article>;
          })}
          {!classrooms.length ? <p className="structure-empty"><strong>No classrooms yet</strong><span>{activeBranches.length ? "Add a classroom when you are ready." : "Create a branch before adding a classroom."}</span></p> : null}
        </div>
        {activeBranches.length ? <details className="editor structure-create" open={!classrooms.length}><summary>Create classroom</summary>
          <form action={createClassroomAction} className="form-stack">
            <label className="field"><span>Branch</span><select name="branch_id">{activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label className="field"><span>Classroom name</span><input name="name" required maxLength={120} /></label>
            <button className="button button-primary">Create classroom</button>
          </form>
        </details> : <p className="structure-prerequisite">Create or reactivate a branch before adding classrooms.</p>}
      </section>
    </div>
  </section>;
}
