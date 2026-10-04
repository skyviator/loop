import type { Metadata } from "next";

import { LoopLogo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Loop — Coming Soon",
  description: "Loop is coming soon. Built for nurseries, preschools and families.",
};

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-12 text-center sm:px-8">
      <section className="flex w-full max-w-xl flex-col items-center" aria-labelledby="coming-soon-title">
        <div className="mb-10 sm:mb-12">
          <LoopLogo />
        </div>

        <h1
          id="coming-soon-title"
          className="max-w-lg text-[clamp(2rem,8vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.045em] text-loop-text"
        >
          Something lovely is coming.
        </h1>

        <p className="mt-5 text-base font-semibold leading-relaxed text-loop-primary-strong sm:text-lg">
          Loop is coming soon.
        </p>

        <p className="mt-3 max-w-md text-sm leading-7 text-loop-text-muted sm:text-base">
          Built for nurseries, preschools and families.
        </p>
      </section>
    </main>
  );
}
