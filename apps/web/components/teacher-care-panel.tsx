"use client";

import { useActionState, useState } from "react";

import type { FeatureKey } from "@loop/domain";

import {
  endSleepBatchAction,
  saveCareBatchAction,
} from "@/app/actions/core";
import type { ActionState } from "@/app/actions/core";
import { LoopIcon, type LoopIconName } from "@/components/loop-icon";

type CareCategory = "meal" | "bottle" | "water" | "sleep" | "toilet" | "nappy" | "mood" | "activity" | "note";
type Child = { id: string; name: string; present: boolean; sleepEventId: string | null };
type CurrentSlot = { id: string; featureKey: string | null } | null;
const initialActionState: ActionState = { status: "idle", message: "" };

const featureCategory: Partial<Record<FeatureKey, CareCategory>> = {
  meals: "meal",
  bottle: "bottle",
  water: "water",
  sleep: "sleep",
  toilet: "toilet",
  nappy: "nappy",
  mood: "mood",
  activities: "activity",
  notes: "note",
};

const moduleMeta: Record<CareCategory, { label: string; icon: LoopIconName }> = {
  meal: { label: "Meal", icon: "meal" },
  bottle: { label: "Bottle", icon: "bottle" },
  water: { label: "Water", icon: "water" },
  sleep: { label: "Sleep", icon: "rest" },
  toilet: { label: "Toilet", icon: "toilet" },
  nappy: { label: "Nappy", icon: "nappy" },
  mood: { label: "Mood", icon: "mood" },
  activity: { label: "Activity", icon: "activity" },
  note: { label: "Note", icon: "note" },
};

const outcomes: Partial<Record<CareCategory, Array<{ value: string; label: string }>>> = {
  meal: [
    { value: "ate_all", label: "Ate all" }, { value: "ate_most", label: "Ate most" },
    { value: "ate_some", label: "Ate some" }, { value: "ate_little", label: "Ate a little" },
    { value: "none_refused", label: "None / refused" },
  ],
  water: [
    { value: "drank_well", label: "Drank well" }, { value: "some", label: "Some" }, { value: "sips", label: "A few sips" },
  ],
  toilet: [
    { value: "pee", label: "Pee" }, { value: "poop", label: "Poop" }, { value: "both", label: "Both" }, { value: "tried", label: "Tried — no result" },
  ],
  nappy: [
    { value: "wet", label: "Wet" }, { value: "soiled", label: "Soiled" }, { value: "both", label: "Wet and soiled" }, { value: "dry", label: "Dry check" },
  ],
  mood: [
    { value: "settled", label: "Settled" }, { value: "happy", label: "Happy" }, { value: "quiet", label: "Quiet" }, { value: "upset", label: "Upset" },
  ],
};

function InlineResult({ state }: { state: typeof initialActionState }) {
  return state.status === "idle" ? null : <p className={`form-result status-${state.status}`} role="status" aria-live="polite">{state.message}</p>;
}

function ChildSelection({ roster, category }: { roster: Child[]; category: CareCategory }) {
  const options = outcomes[category];
  const selectable = roster.filter((child) => child.present && (category !== "sleep" || !child.sleepEventId));
  if (!selectable.length) return <p className="status-note status-warning">No eligible children are currently present.</p>;
  return <div className="bulk-children" aria-label="Present children">
    {selectable.map((child) => <div className="bulk-child" key={child.id}>
      <label className="check-field"><input type="checkbox" name="child_id" value={child.id} defaultChecked /> {child.name}</label>
      {options ? <label className="compact-field"><span className="sr-only">Exception for {child.name}</span><select name={`outcome_${child.id}`} defaultValue=""><option value="">Use class default</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : null}
      {category === "bottle" ? <label className="compact-field"><span className="sr-only">Bottle amount exception for {child.name}</span><select name={`quantity_${child.id}`} defaultValue=""><option value="">Use class amount</option><option value="60">60 ml</option><option value="90">90 ml</option><option value="120">120 ml</option><option value="150">150 ml</option><option value="180">180 ml</option></select></label> : null}
    </div>)}
  </div>;
}

function CareForm({ category, roster, classroomId, serviceDate, currentSlot }: { category: CareCategory; roster: Child[]; classroomId: string; serviceDate: string; currentSlot: CurrentSlot }) {
  const [state, action, pending] = useActionState(saveCareBatchAction, initialActionState);
  const options = outcomes[category];
  const defaultValue = category === "meal" ? "ate_most" : category === "water" ? "drank_well" : category === "toilet" ? "pee" : category === "nappy" ? "wet" : category === "mood" ? "settled" : "";
  const linkedFeature = category === "meal" ? "meals" : category === "activity" ? "activities" : category;
  const linkedSlotId = currentSlot?.featureKey === linkedFeature ? currentSlot.id : "";
  return <form action={action} className="care-form">
    <input type="hidden" name="category" value={category} />
    <input type="hidden" name="classroom_id" value={classroomId} />
    <input type="hidden" name="service_date" value={serviceDate} />
    <input type="hidden" name="timetable_slot_id" value={linkedSlotId} />
    {options && category !== "mood" ? <label className="field"><span>Class default</span><select name="default_outcome" defaultValue={defaultValue}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : null}
    {category === "mood" ? <fieldset className="mood-options"><legend>Class default</legend>{options?.map((option) => <label className="mood-choice" key={option.value}><input type="radio" name="default_outcome" value={option.value} defaultChecked={option.value === "settled"} /><LoopIcon name={`mood-${option.value}` as LoopIconName} className="size-6" /><span>{option.label}</span></label>)}</fieldset> : null}
    {category === "bottle" ? <div className="bulk-default"><label className="field"><span>Class amount</span><select name="default_quantity" defaultValue="120"><option value="60">60 ml</option><option value="90">90 ml</option><option value="120">120 ml</option><option value="150">150 ml</option><option value="180">180 ml</option></select></label><label className="field"><span>Or custom ml</span><input name="custom_quantity" type="number" min="1" max="1000" inputMode="decimal" /></label></div> : null}
    {category === "water" ? <label className="field optional-quantity"><span>Optional class amount (ml)</span><input name="custom_quantity" type="number" min="1" max="1000" inputMode="decimal" /></label> : null}
    {category === "activity" ? <label className="field"><span>Activity title</span><input name="activity_title" maxLength={40} required /></label> : null}
    {category === "note" || category === "activity" || category === "meal" || category === "bottle" || category === "water" ? <label className="field"><span>{category === "note" ? "Teacher note" : "Optional note"}</span><textarea name="note" maxLength={500} rows={2} required={category === "note"} /></label> : null}
    <p className="muted">Present children are selected automatically. Uncheck anyone this update does not apply to, then change exceptions only.</p>
    <ChildSelection roster={roster} category={category} />
    <div className="form-footer"><InlineResult state={state} /><button className="button button-primary" disabled={pending}>{pending ? "Saving…" : category === "sleep" ? "Start sleep for selected" : `Save ${moduleMeta[category].label.toLowerCase()} update`}</button></div>
  </form>;
}

function SleepPanel({ roster, classroomId, serviceDate, currentSlot }: { roster: Child[]; classroomId: string; serviceDate: string; currentSlot: CurrentSlot }) {
  const [endState, endAction, ending] = useActionState(endSleepBatchAction, initialActionState);
  const sleeping = roster.filter((child) => child.sleepEventId);
  return <div className="sleep-workflow">
    <div><h3>Start sleep</h3><p className="muted">Select children settling now. Their wake time is recorded later.</p><CareForm category="sleep" roster={roster} classroomId={classroomId} serviceDate={serviceDate} currentSlot={currentSlot} /></div>
    <div className="wake-panel"><h3>End sleep</h3>{sleeping.length ? <form action={endAction}><input type="hidden" name="classroom_id" value={classroomId} /><div className="bulk-children">{sleeping.map((child) => <label className="bulk-child check-field" key={child.sleepEventId}><input type="checkbox" name="sleep_event_id" value={child.sleepEventId!} defaultChecked /> {child.name}</label>)}</div><div className="form-footer"><InlineResult state={endState} /><button className="button button-secondary" disabled={ending}>{ending ? "Saving…" : "End sleep for selected"}</button></div></form> : <p className="empty-inline">No children are currently sleeping.</p>}</div>
  </div>;
}

export function TeacherCarePanel({ enabledFeatures, roster, classroomId, serviceDate, currentSlot }: { enabledFeatures: FeatureKey[]; roster: Child[]; classroomId: string; serviceDate: string; currentSlot: CurrentSlot }) {
  const categories = enabledFeatures.map((feature) => featureCategory[feature]).filter((category): category is CareCategory => Boolean(category));
  const [selected, setSelected] = useState<CareCategory>(categories[0] ?? "meal");
  if (!categories.length) return <p className="status-note status-warning">Care modules are not enabled by your school.</p>;
  return <>
    <div className="quick-actions" role="tablist" aria-label="Care modules">{categories.map((category) => <button className={selected === category ? "selected" : ""} type="button" role="tab" aria-selected={selected === category} key={category} onClick={() => setSelected(category)}><LoopIcon name={moduleMeta[category].icon} className="size-6" /><span>{moduleMeta[category].label}</span></button>)}</div>
    <div className="care-workspace" role="tabpanel"><div className="care-workspace-heading"><LoopIcon name={moduleMeta[selected].icon} className="size-6" /><div><h3>{moduleMeta[selected].label}</h3><p>{selected === "sleep" ? "Start now, end when each child wakes." : "Set the group default, then edit exceptions."}</p></div></div>{selected === "sleep" ? <SleepPanel roster={roster} classroomId={classroomId} serviceDate={serviceDate} currentSlot={currentSlot} /> : <CareForm category={selected} roster={roster} classroomId={classroomId} serviceDate={serviceDate} currentSlot={currentSlot} />}</div>
  </>;
}
