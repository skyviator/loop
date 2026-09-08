"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="auth-page"><section className="auth-card"><h1>Something didn’t load</h1><p className="muted">We could not complete that request. Your existing data was not changed.</p><button className="button button-primary" onClick={reset}>Try again</button></section></main>;
}
