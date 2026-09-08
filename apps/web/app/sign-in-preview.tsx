"use client";

import { useState } from "react";

const FOUNDATION_NOTICE = "Sign in will be connected in a later step.";

export function SignInPreview() {
  const [notice, setNotice] = useState("");

  return (
    <div className="mt-8 w-full max-w-[25rem]">
      <button
        type="button"
        onClick={() => setNotice(FOUNDATION_NOTICE)}
        className="h-[52px] w-full rounded-[var(--loop-radius-control)] bg-loop-primary px-6 text-sm font-semibold leading-5 text-white transition-colors duration-[var(--loop-motion-normal)] hover:bg-loop-primary-strong focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-loop-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-loop-bg active:bg-loop-primary-strong motion-reduce:transition-none"
      >
        Sign in
      </button>
      <p
        aria-live="polite"
        className="mt-3 min-h-6 text-[0.8125rem] font-medium leading-[1.125rem] text-loop-text-muted"
      >
        {notice}
      </p>
    </div>
  );
}

