"use client";

import { useId, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { updateBranchAction, updateClassroomAction } from "@/app/actions/core";

type BranchStatusActionProps = {
  kind: "branch";
  id: string;
  name: string;
  status: "active" | "inactive" | "archived";
};

type ClassroomStatusActionProps = {
  kind: "classroom";
  id: string;
  name: string;
  branchId: string;
  branchActive: boolean;
  status: "active" | "inactive" | "archived";
};

type StructureStatusActionProps = BranchStatusActionProps | ClassroomStatusActionProps;

function SubmitStatusButton({ children, tone = "secondary" }: { children: ReactNode; tone?: "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return <button className={`button button-${tone}`} disabled={pending}>{pending ? "Saving…" : children}</button>;
}

function HiddenEntityFields({ entity, nextStatus }: { entity: StructureStatusActionProps; nextStatus: "active" | "inactive" }) {
  return <>
    <input type="hidden" name={entity.kind === "branch" ? "branch_id" : "classroom_id"} value={entity.id} />
    <input type="hidden" name="name" value={entity.name} />
    {entity.kind === "classroom" ? <input type="hidden" name="branch_id" value={entity.branchId} /> : null}
    <input type="hidden" name="status" value={nextStatus} />
  </>;
}

export function StructureStatusAction(props: StructureStatusActionProps) {
  const [confirming, setConfirming] = useState(false);
  const confirmationId = useId();
  const action = props.kind === "branch" ? updateBranchAction : updateClassroomAction;
  const label = props.kind === "branch" ? "branch" : "classroom";

  if (props.status !== "active") {
    if (props.kind === "classroom" && !props.branchActive) {
      return <p className="structure-action-note">Reactivate its branch before reactivating this classroom.</p>;
    }
    return <form action={action} className="structure-status-form">
      <HiddenEntityFields entity={props} nextStatus="active" />
      <SubmitStatusButton>Reactivate {label}</SubmitStatusButton>
    </form>;
  }

  if (!confirming) {
    return <button type="button" className="text-button structure-danger-trigger" aria-expanded="false" aria-controls={confirmationId} onClick={() => setConfirming(true)}>Deactivate {label}</button>;
  }

  const warning = props.kind === "branch"
    ? "This branch will no longer be available to teachers or families. Existing records will be kept."
    : "This classroom will no longer be available to assigned teachers or enrolled families. Existing records will be kept.";

  return <div id={confirmationId} className="structure-confirmation" role="group" aria-label={`Confirm ${label} deactivation`}>
    <p>{warning}</p>
    <div className="structure-confirmation-actions">
      <form action={action} className="structure-status-form">
        <HiddenEntityFields entity={props} nextStatus="inactive" />
        <SubmitStatusButton tone="danger">Confirm deactivation</SubmitStatusButton>
      </form>
      <button type="button" className="button button-secondary" onClick={() => setConfirming(false)}>Cancel</button>
    </div>
  </div>;
}
