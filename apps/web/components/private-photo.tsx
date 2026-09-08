"use client";

/* eslint-disable @next/next/no-img-element -- Private R2 bearer URLs must bypass framework image optimization and diagnostics. */

import { useEffect, useRef, useState } from "react";

import { LoopIcon } from "@/components/loop-icon";

type Variant = "thumbnail" | "display" | "original";

async function photoUrl(assetId: string, variant: Variant) {
  const response = await fetch(`/api/media/${assetId}/url?variant=${variant}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Photo is unavailable.");
  return (await response.json() as { url: string }).url;
}

export function PrivatePhoto({ assetId, caption }: { assetId: string; caption: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const [thumbnail, setThumbnail] = useState<string>();
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState(false);

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

  return <div className="private-photo" ref={host}>
    <button className="photo-frame" type="button" onClick={openPreview} aria-label={caption ? `Open photo: ${caption}` : "Open photo"}>
      {thumbnail ? <img src={thumbnail} alt={caption ?? "Nursery photo"} loading="lazy" decoding="async" /> : <span className="photo-placeholder"><LoopIcon name="photo" className="size-6" />{error ? "Photo unavailable" : "Loading photo"}</span>}
    </button>
    {caption ? <p>{caption}</p> : null}
    {preview ? <div className="photo-preview" role="dialog" aria-modal="true" aria-label="Photo preview">
      <div className="photo-preview-toolbar"><button className="button button-secondary" type="button" onClick={downloadOriginal}>Download original</button><button className="text-button" type="button" onClick={() => setPreview(undefined)}>Close</button></div>
      <img src={preview} alt={caption ?? "Nursery photo"} />
    </div> : null}
  </div>;
}
