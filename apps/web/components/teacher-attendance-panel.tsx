"use client";

import { useActionState, useState } from "react";

import { setAttendanceAction, updateAttendanceBatchAction, type ActionState } from "@/app/actions/core";
import { LoopIcon } from "@/components/loop-icon";

type AttendanceStatus = "expected" | "present" | "absent" | "excused";
type Child = {
  id: string;
  name: string;
  status: AttendanceStatus;
  checkedOut: boolean;
};

const initialState: ActionState = { status: "idle", message: "" };

function Result({ state }: { state: ActionState }) {
  return state.status === "idle" ? null : <p className={`form-result status-${state.status}`} role="status" aria-live="polite">{state.message}</p>;
}

function BulkAttendanceForm({
  classroomId,
  operation,
  roster,
}: {
  classroomId: string;
  operation: "check_in" | "check_out";
  roster: Child[];
}) {
  const [state, action, pending] = useActionState(updateAttendanceBatchAction, initialState);
  const [selected, setSelected] = useState(() => new Set(roster.map((child) => child.id)));
  if (!roster.length) return null;
  const arrival = operation === "check_in";
  return <form action={action} className="bulk-attendance">
    <input type="hidden" name="classroom_id" value={classroomId} />
    <input type="hidden" name="attendance_action" value={operation} />
    <div className="bulk-attendance-heading">
      <div><strong>{arrival ? "Morning arrivals" : "End-of-day checkout"}</strong><p>{arrival ? "Eligible children are selected. Uncheck exceptions." : "Everyone still present is selected. Uncheck anyone staying."}</p></div>
      <div className="selection-actions">
        <button type="button" className="text-button" onClick={() => setSelected(new Set(roster.map((child) => child.id)))}>Select all</button>
        <button type="button" className="text-button" onClick={() => setSelected(new Set())}>Clear</button>
      </div>
    </div>
    <div className="bulk-arrival-choices">
      {roster.map((child) => <label className="check-field" key={child.id}><input type="checkbox" name="child_id" value={child.id} checked={selected.has(child.id)} onChange={(event) => { const checked = event.currentTarget.checked; setSelected((current) => { const next = new Set(current); if (checked) next.add(child.id); else next.delete(child.id); return next; }); }} /> {child.name}</label>)}
    </div>
    <div className="form-footer"><Result state={state} /><button className="button button-secondary" type="submit" disabled={pending || selected.size === 0}>{pending ? "Saving…" : arrival ? `Check in selected (${selected.size})` : `Check out selected (${selected.size})`}</button></div>
  </form>;
}

export function TeacherAttendancePanel({ classroomId, roster }: { classroomId: string; roster: Child[] }) {
  const arrivals = roster.filter((child) => child.status === "expected" && !child.checkedOut);
  const present = roster.filter((child) => child.status === "present" && !child.checkedOut);
  return <>
    <div className="attendance-bulk-grid">
      <BulkAttendanceForm key={`check-in-${arrivals.map((child) => child.id).join("-")}`} classroomId={classroomId} operation="check_in" roster={arrivals} />
      <BulkAttendanceForm key={`check-out-${present.map((child) => child.id).join("-")}`} classroomId={classroomId} operation="check_out" roster={present} />
    </div>
    <div className="attendance-list">
      {roster.map((child) => {
        const isPresent = child.status === "present" && !child.checkedOut;
        const label = child.checkedOut ? "Checked out" : isPresent ? "Checked in" : child.status === "expected" ? "Not yet arrived" : child.status === "absent" ? "Absent" : "Excused";
        return <div className="attendance-row" key={child.id}>
          <span className={`attendance-mark ${isPresent ? "is-present" : ""}`}><LoopIcon name={isPresent ? "check" : "clock"} className="size-5" /></span>
          <strong>{child.name}</strong>
          <span>{label}</span>
          <form action={setAttendanceAction} className="attendance-row-actions">
            <input type="hidden" name="child_id" value={child.id} />
            <input type="hidden" name="classroom_id" value={classroomId} />
            {isPresent ? <button className="text-button" name="attendance_action" value="check_out" type="submit">Check out</button> : child.checkedOut ? <span className="meta">Recorded</span> : <>
              <button className="text-button" name="attendance_action" value="check_in" type="submit">Check in</button>
              {child.status === "expected" ? <details className="attendance-exceptions"><summary>Exception</summary><div><button className="text-button" name="attendance_action" value="absent" type="submit">Absent</button><button className="text-button" name="attendance_action" value="excused" type="submit">Excused</button></div></details> : null}
            </>}
          </form>
        </div>;
      })}
    </div>
  </>;
}
