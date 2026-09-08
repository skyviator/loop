import type { SVGProps } from "react";

export type LoopIconName =
  | "activity" | "attendance" | "bottle" | "building" | "calendar" | "check"
  | "chevron" | "child" | "clock" | "home" | "meal" | "mood" | "nappy"
  | "mood-settled" | "mood-happy" | "mood-quiet" | "mood-upset"
  | "note" | "people" | "rest" | "settings" | "signout" | "toilet" | "water";

const paths: Record<LoopIconName, React.ReactNode> = {
  activity: <><path d="m6 18 4-12 4 12 3-9 2 9"/><path d="M4 18h16"/></>,
  attendance: <><path d="M5 12.5 9.5 17 19 7.5"/></>,
  bottle: <><path d="M9 4h6v3l2 3v9H7v-9l2-3Z"/><path d="M9 13h8"/></>,
  building: <><path d="M4 20V8l8-4 8 4v12"/><path d="M8 20v-5h8v5M8 10h.01M12 10h.01M16 10h.01"/></>,
  calendar: <><path d="M5 6h14v14H5zM8 3v6M16 3v6M5 11h14"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  chevron: <path d="m9 6 6 6-6 6"/>,
  child: <><circle cx="12" cy="8" r="3"/><path d="M6 20c.5-4 2.5-6 6-6s5.5 2 6 6"/></>,
  clock: <><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>,
  home: <><path d="m4 11 8-7 8 7"/><path d="M6 10v10h12V10M10 20v-6h4v6"/></>,
  meal: <><path d="M5 4v7M8 4v7M5 8h3M6.5 11v9M15 4c-3 4-3 8 1 9v7M18 4v16"/></>,
  mood: <><circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M8.5 14.5c2 2 5 2 7 0"/></>,
  "mood-settled": <><circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M9.5 15h5"/></>,
  "mood-happy": <><circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M8.5 14.5c2 2.5 5 2.5 7 0"/></>,
  "mood-quiet": <><circle cx="12" cy="12" r="8"/><path d="m8.5 10 1.5.5M15.5 10l-1.5.5M9.5 15h5"/></>,
  "mood-upset": <><circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M9 16c2-2 4-2 6 0"/></>,
  nappy: <><path d="M5 7h14l-2 12H7Z"/><path d="m6 10 4 3h4l4-3M8 7V4M16 7V4"/></>,
  note: <><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 12h6M9 16h6"/></>,
  people: <><circle cx="9" cy="9" r="3"/><path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 7c2 0 3 1 3 3s-1 3-3 3M17 15c2.5.4 4 2 4 5"/></>,
  rest: <><path d="M18 15a7 7 0 1 1-9-9 7 7 0 0 0 9 9Z"/><path d="M16 5h4l-4 4h4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/></>,
  signout: <><path d="M14 5H6v14h8M11 12h10M18 9l3 3-3 3"/></>,
  toilet: <><path d="M6 4h8v7a4 4 0 0 1-4 4H6Z"/><path d="M14 7h3a2 2 0 0 1 0 4h-3M9 15v5M6 20h6"/></>,
  water: <path d="M12 3S6 10 6 15a6 6 0 0 0 12 0c0-5-6-12-6-12Z"/>,
};

export function LoopIcon({ name, ...props }: { name: LoopIconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  );
}
