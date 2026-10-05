"use client";

/* eslint-disable @next/next/no-img-element -- Private R2 bearer URLs must bypass framework image optimization and diagnostics. */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { LoopIcon } from "@/components/loop-icon";

type Variant = "thumbnail" | "display" | "original";

async function photoUrl(assetId: string, variant: Variant) {
  const response = await fetch(`/api/media/${assetId}/url?variant=${variant}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Photo is unavailable.");
  return (await response.json() as { url: string }).url;
}

export function PrivatePhoto({ assetId, caption, canRemove = false }: { assetId: string; caption: string | null; canRemove?: boolean }) {
  const router = useRouter();
  const host = useRef<HTMLDivElement>(null);
  const [thumbnail, setThumbnail] = useState<string>();
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [removeError, setRemoveError] = useState<string>();

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void photoUrl(assetId, "thumbnail").then(setThumbnail).catch(() => setError(true));
    }, { rootMargin: "160px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [assetId]);

  async function openPreview() {
    try {
      setPreview(await photoUrl(assetId, "display"));
    } catch {
      setError(true);
    }
  }

  async function downloadOriginal() {
    try {
      const url = await photoUrl(assetId, "original");
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "loop-photo.jpg";
      anchor.rel = "noopener";
      anchor.click();
    } catch {
      setError(true);
    }
  }

  async function removePhoto() {
    if (!window.confirm("Remove this photo from Loop? It will disappear immediately and its private files will be deleted.")) return;
    setRemoving(true);
    setRemoveError(undefined);
    try {
      const response = await fetch(`/api/media/${assetId}/url`, { method: "DELETE" });
      if (!response.ok) throw new Error("The photo could not be removed.");
      setPreview(undefined);
      setRemoved(true);
      router.refresh();
    } catch {
      setRemoveError("The photo could not be removed. Please try again.");
    } finally {
      setRemoving(false);
    }
  }

  if (removed) return null;

  return <div className="private-photo" ref={host}>
    <button className="photo-frame" type="button" onClick={openPreview} aria-label={caption ? `Open photo: ${caption}` : "Open photo"}>
      {thumbnail ? <img src={thumbnail} alt={caption ?? "Nursery photo"} loading="lazy" decoding="async" /> : <span className="photo-placeholder"><LoopIcon name="photo" className="size-6" />{error ? "Photo unavailable" : "Loading photo"}</span>}
    </button>
    {caption ? <p>{caption}</p> : null}
    {canRemove ? <div className="photo-actions"><button className="text-button danger-text" type="button" disabled={removing} onClick={removePhoto}>{removing ? "Removing…" : "Remove photo"}</button></div> : null}
    {removeError ? <p className="error-text" role="status">{removeError}</p> : null}
    {preview ? <div className="photo-preview" role="dialog" aria-modal="true" aria-label="Photo preview">
      <div className="photo-preview-toolbar"><button className="button button-secondary" type="button" onClick={downloadOriginal}>Download original</button><button className="text-button" type="button" onClick={() => setPreview(undefined)}>Close</button></div>
      <img src={preview} alt={caption ?? "Nursery photo"} />
    </div> : null}
  </div>;
}
