import Image from "next/image";

export function LoopLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Image
      src="/brand/loop-logo-approved-master.png"
      width={1254}
      height={1254}
      priority
      alt="Loop — Brighter days together"
      className={compact ? "h-14 w-14 object-contain" : "h-auto w-36 object-contain"}
    />
  );
}
