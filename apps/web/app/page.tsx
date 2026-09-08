import Image from "next/image";

import { SignInPreview } from "./sign-in-preview";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[32rem] flex-col px-4 sm:px-5">
      <section className="flex flex-1 flex-col items-center justify-center py-10 text-center sm:py-12">
        <Image
          src="/brand/loop-logo-approved-master.png"
          width={1254}
          height={1254}
          priority
          alt="Loop — Brighter days together"
          className="mb-4 h-auto w-[15rem] max-w-[72vw] sm:w-[16rem]"
        />

        <p className="max-w-[25rem] text-base leading-6 text-loop-text-muted">
          A simple way to stay connected with your child&apos;s day.
        </p>

        <SignInPreview />
      </section>

      <footer className="pb-6 text-center text-[0.8125rem] font-medium leading-[1.125rem] text-loop-text-muted sm:pb-8">
        Powered by Loop
      </footer>
    </main>
  );
}

