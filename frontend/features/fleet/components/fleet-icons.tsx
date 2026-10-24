import type { CSSProperties } from "react";

export function FleetIcon({ name = "pin", className = "size-5", style }: { name?: "pin" | "building" | "drivers" | "search" | "close" | "arrow" | "focus" | "phone" | "signal" | "chevron"; className?: string; style?: CSSProperties }) {
  const paths = {
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    building: <><path d="M4 21V5l8-2v18M12 9h8v12M2 21h20M7 8h2m-2 4h2m-2 4h2m6-3h2m-2 4h2" /></>,
    drivers: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-17a3 3 0 0 1 0 6m1 5a5 5 0 0 1 3 5" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="M20 12H4m6-6-6 6 6 6" />,
    focus: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></>,
    phone: <path d="m5 3 4 1 1 5-2 2a15 15 0 0 0 5 5l2-2 5 1 1 4c-2 5-9 1-13-3S0 5 5 3Z" />,
    signal: <><path d="M4 20v-3m5 3v-7m5 7V9m5 11V4" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>{paths[name]}</svg>;
}
