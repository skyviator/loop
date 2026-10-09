"use client";

import { useMemo, useState } from "react";

import {
  archiveTimetableExceptionAction,
  createTimetableExceptionAction,
  createTimetableSlotAction,
  updateTimetableSlotAction,
} from "@/app/actions/core";

type Classroom = { id: string; name: string; status: "active" | "inactive" | "archived" };
type Slot = {
  id: string;
  classroom_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  title: string;
  status: "active" | "inactive" | "archived";
};
type Exception = {
  id: string;
  classroom_id: string;
  service_date: string;
  kind: "cancelled" | "changed" | "replacement" | "additional";
  reason: string | null;
  replacement_title: string | null;
  status: "active" | "inactive" | "archived";
};
type CareFeature = { key: string; label: string };

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function TimetableManagement({ classrooms, slots, exceptions, careFeatures }: {
  classrooms: Classroom[];
  slots: Slot[];
  exceptions: Exception[];
  careFeatures: CareFeature[];
}) {
  const activeClassrooms = classrooms.filter((room) => room.status === "active");
  const [classroomId, setClassroomId] = useState(activeClassrooms[0]?.id ?? classrooms[0]?.id ?? "");
  const classroom = classrooms.find((room) => room.id === classroomId);
  const visibleSlots = useMemo(() => slots.filter((slot) => slot.classroom_id === classroomId), [classroomId, slots]);
  const visibleExceptions = exceptions.filter((item) => item.classroom_id === classroomId);

  return <div className="timetable-page">
    <section className="section-panel timetable-toolbar">
      <div>
        <p className="eyebrow">Recurring week</p>
        <h2>{classroom?.name ?? "Timetable"}</h2>
        <p className="muted">Choose a classroom, then manage its usual week and date-specific changes.</p>
      </div>
      <label className="field timetable-classroom-select"><span>Classroom</span><select value={classroomId} onChange={(event) => setClassroomId(event.target.value)}>{classrooms.map((room) => <option key={room.id} value={room.id}>{room.name}{room.status !== "active" ? ` (${room.status})` : ""}</option>)}</select></label>
    </section>

    {!classrooms.length ? <section className="section-panel empty-state"><h2>No classrooms yet</h2><p>Create a classroom before adding timetable activities.</p></section> : <>
      <div className="timetable-actions">
        <details className="editor"><summary>Add recurring activity</summary><form action={createTimetableSlotAction} className="form-grid timetable-form">
          <input type="hidden" name="classroom_id" value={classroomId} />
          <label className="field"><span>Day</span><select name="day_of_week">{weekdays.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label>
          <label className="field"><span>Start</span><input name="start_time" type="time" required /></label>
          <label className="field"><span>End</span><input name="end_time" type="time" required /></label>
          <label className="field timetable-form-wide"><span>Activity</span><input name="title" required maxLength={120} /></label>
          <label className="field"><span>Linked care</span><select name="care_feature_key"><option value="">None</option>{careFeatures.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <button className="button button-primary">Add activity</button>
        </form></details>
        <details className="editor"><summary>Add date exception</summary><form action={createTimetableExceptionAction} className="form-grid timetable-form">
          <input type="hidden" name="classroom_id" value={classroomId} />
          <label className="field"><span>Date</span><input type="date" name="service_date" required /></label>
          <label className="field"><span>Type</span><select name="kind"><option value="cancelled">Cancelled</option><option value="changed">Changed</option><option value="additional">Additional</option></select></label>
          <label className="field timetable-form-wide"><span>Existing activity</span><select name="timetable_slot_id"><option value="">Choose activity</option>{visibleSlots.filter((item) => item.status === "active").map((slot) => <option key={slot.id} value={slot.id}>{weekdays[slot.day_of_week - 1]} · {slot.start_time.slice(0, 5)} · {slot.title}</option>)}</select></label>
          <label className="field"><span>Replacement activity</span><input name="replacement_title" /></label>
          <label className="field"><span>Start</span><input name="replacement_start_time" type="time" /></label>
          <label className="field"><span>End</span><input name="replacement_end_time" type="time" /></label>
          <label className="field timetable-form-wide"><span>Reason</span><input name="reason" maxLength={300} /></label>
          <button className="button button-secondary">Add exception</button>
        </form></details>
      </div>

      <section className="section-panel timetable-week" aria-label={`${classroom?.name ?? "Classroom"} recurring timetable`}>
        <div className="section-heading"><h2>Weekly activities</h2><span className="count-label">{visibleSlots.length} {visibleSlots.length === 1 ? "activity" : "activities"}</span></div>
        <div className="weekday-list">{weekdays.map((day, index) => {
          const daySlots = visibleSlots.filter((slot) => slot.day_of_week === index + 1);
          return <section className="weekday-group" key={day} aria-labelledby={`weekday-${index}`}>
            <h3 id={`weekday-${index}`}>{day}</h3>
            {daySlots.length ? <div className="weekday-activities">{daySlots.map((slot) => <details className="timetable-activity" key={slot.id}>
              <summary><time>{slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</time><strong>{slot.title}</strong><span>{slot.status}</span></summary>
              <form action={updateTimetableSlotAction} className="form-grid timetable-form">
                <input type="hidden" name="slot_id" value={slot.id} />
                <label className="field"><span>Day</span><select name="day_of_week" defaultValue={slot.day_of_week}>{weekdays.map((option, optionIndex) => <option value={optionIndex + 1} key={option}>{option}</option>)}</select></label>
                <label className="field"><span>Start</span><input name="start_time" type="time" defaultValue={slot.start_time.slice(0, 5)} required /></label>
                <label className="field"><span>End</span><input name="end_time" type="time" defaultValue={slot.end_time.slice(0, 5)} required /></label>
                <label className="field timetable-form-wide"><span>Activity</span><input name="title" defaultValue={slot.title} required maxLength={120} /></label>
                <label className="field"><span>Status</span><select name="status" defaultValue={slot.status}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label>
                <button className="button button-secondary">Save activity</button>
              </form>
            </details>)}</div> : <p className="timetable-day-empty">No recurring activities.</p>}
          </section>;
        })}</div>
      </section>

      <section className="section-panel timetable-exceptions">
        <div className="section-heading"><div><p className="eyebrow">Date-specific</p><h2>Upcoming exceptions</h2></div></div>
        {visibleExceptions.length ? visibleExceptions.map((item) => <div className="person-row" key={item.id}><span><strong>{item.service_date} · {item.kind}</strong><small>{item.replacement_title ?? item.reason ?? "Timetable activity"} · {item.status}</small></span>{item.status === "active" ? <form action={archiveTimetableExceptionAction}><input type="hidden" name="exception_id" value={item.id} /><button className="text-button">Archive</button></form> : null}</div>) : <p className="empty-inline">No upcoming exceptions for this classroom.</p>}
      </section>
    </>}
  </div>;
}
