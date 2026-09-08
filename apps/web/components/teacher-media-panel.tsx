"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { LoopIcon } from "@/components/loop-icon";

type Child = { id: string; name: string; present: boolean; consent: "not_recorded" | "granted" | "denied" };
type UploadState = { name: string; status: "preparing" | "uploading" | "complete" | "error"; message: string };

async function runWithConcurrency<T>(items: readonly T[], concurrency: number, task: (item: T, index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await task(items[index], index);
    }
  }));
}

export function TeacherMediaPanel({ classroomId, roster }: { classroomId: string; roster: Child[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [states, setStates] = useState<UploadState[]>([]);
  const [busy, setBusy] = useState(false);
  const eligible = roster.filter((child) => child.consent === "granted");
  const blocked = roster.filter((child) => child.consent !== "granted");

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const files = form.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
    const childIds = form.getAll("child_id").map(String);
    const caption = String(form.get("caption") ?? "").trim();
    if (!files.length || files.length > 3 || !childIds.length) {
      setStates([{ name: "Photos", status: "error", message: files.length > 3 ? "Choose no more than 3 photos." : !childIds.length ? "Tag at least one child with granted consent." : "Choose at least one photo." }]);
      return;
    }
    setBusy(true);
    setStates(files.map((file) => ({ name: file.name, status: "preparing", message: "Preparing safely" })));
    try {
      const { processPhoto } = await import("@/lib/media/image-processing");
      await runWithConcurrency(files, 2, async (file, index) => {
        try {
          const processed = await processPhoto(file);
          setStates((current) => current.map((state, position) => position === index ? { ...state, status: "uploading", message: "Uploading 3 private sizes" } : state));
          const reservationResponse = await fetch("/api/media/reservations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              classroomId,
              childIds,
              caption: caption || null,
              capturedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
              variants: processed.variants.map((variant) => ({ kind: variant.kind, contentType: variant.contentType, byteSize: variant.byteSize, width: variant.width, height: variant.height })),
            }),
          });
          if (!reservationResponse.ok) throw new Error((await reservationResponse.json() as { error?: string }).error ?? "Upload was not authorized.");
          const reservation = await reservationResponse.json() as { reservationId: string; uploads: Array<{ kind: string; url: string; contentType: string }> };
          await Promise.all(reservation.uploads.map(async (target) => {
            const variant = processed.variants.find((item) => item.kind === target.kind);
            if (!variant) throw new Error("Upload preparation did not match the reservation.");
            const response = await fetch(target.url, { method: "PUT", headers: { "Content-Type": target.contentType }, body: variant.blob });
            if (!response.ok) throw new Error("R2 rejected a photo upload.");
          }));
          const finalize = await fetch(`/api/media/reservations/${reservation.reservationId}/finalize`, { method: "POST" });
          if (!finalize.ok) throw new Error((await finalize.json() as { error?: string }).error ?? "Photo verification failed.");
          setStates((current) => current.map((state, position) => position === index ? { ...state, status: "complete", message: "Shared privately" } : state));
        } catch (error) {
          setStates((current) => current.map((state, position) => position === index ? { ...state, status: "error", message: error instanceof Error ? error.message : "Photo upload failed." } : state));
        }
      });
      formRef.current?.reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <form className="media-upload" ref={formRef} onSubmit={upload}>
    <label className="field"><span>Photos</span><input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} /></label>
    <p className="muted">Up to 3 photos, 12 MB each. Loop re-encodes JPEG, PNG, and WebP, removes embedded metadata, and creates display and thumbnail sizes before upload.</p>
    <p className="status-note status-warning">Check the full photo before sharing. Loop cannot detect an untagged child in the background, so staff must still follow the nursery&apos;s consent policy.</p>
    <fieldset className="tag-children"><legend>Tag children</legend>
      {eligible.map((child) => <label className="check-field" key={child.id}><input type="checkbox" name="child_id" value={child.id} disabled={busy} /> {child.name}<small>{child.present ? "Present today" : "Not present now"}</small></label>)}
      {!eligible.length ? <p className="status-note status-warning">No children have granted media consent. A school administrator must record consent first.</p> : null}
    </fieldset>
    {blocked.length ? <details className="consent-note"><summary>{blocked.length} children cannot be tagged</summary><p>{blocked.map((child) => `${child.name} — ${child.consent === "denied" ? "consent denied" : "consent not recorded"}`).join("; ")}</p></details> : null}
    <label className="field"><span>Optional caption</span><input name="caption" maxLength={300} disabled={busy} /></label>
    <button className="button button-primary" type="submit" disabled={busy || !eligible.length}><LoopIcon name="photo" className="size-5" /> {busy ? "Uploading…" : "Share photos"}</button>
    {states.length ? <div className="upload-progress" aria-live="polite">{states.map((state) => <p className={`upload-${state.status}`} key={state.name}><strong>{state.name}</strong><span>{state.message}</span></p>)}</div> : null}
  </form>;
}
