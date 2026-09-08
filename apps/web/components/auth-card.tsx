import type { ReactNode } from "react";

import { LoopLogo } from "./logo";

export function AuthCard({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <LoopLogo />
        <div className="auth-copy"><h1>{title}</h1><p>{intro}</p></div>
        {children}
      </section>
      <p className="powered">Powered by Loop</p>
    </main>
  );
}

export function Field({ label, name, type = "text", autoComplete, defaultValue, required = true }: { label: string; name: string; type?: string; autoComplete?: string; defaultValue?: string; required?: boolean }) {
  return <label className="field"><span>{label}</span><input name={name} type={type} autoComplete={autoComplete} defaultValue={defaultValue} required={required} /></label>;
}
