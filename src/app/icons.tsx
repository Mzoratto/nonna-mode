// Inline icons (no icon library). Decorative unless given a label.
type P = { size?: number; label?: string };
const svg = (path: React.ReactNode, { size = 24, label }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
    strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    {path}
  </svg>
);
export const Shield = (p: P) => svg(<><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6L12 3z" /><circle cx="9.6" cy="11.5" r="0.9" fill="currentColor" /><circle cx="14.4" cy="11.5" r="0.9" fill="currentColor" /></>, p);
export const Phone = (p: P) => svg(<path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />, p);
export const ChevronLeft = (p: P) => svg(<path d="m15 18-6-6 6-6" />, p);
export const ArrowRight = (p: P) => svg(<><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>, p);
export const Pause = (p: P) => svg(<><path d="M9 6v12" /><path d="M15 6v12" /></>, { size: 40, ...p });
export const Check = (p: P) => svg(<path d="m5 12.5 4.5 4.5L19 7.5" />, p);
export const Cross = (p: P) => svg(<><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>, p);
export const Person = (p: P) => svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>, p);
export const Banknote = (p: P) => svg(<><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>, p);
export const MessageAlert = (p: P) => svg(<><path d="M4 5h16v11H9l-5 4V5z" /><path d="M12 8v3.5" /><path d="M12 14h.01" /></>, p);
export const Warning = (p: P) => svg(<><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>, p);
export const Info = (p: P) => svg(<><circle cx="12" cy="12" r="9.5" /><path d="M12 7.5v6" /><path d="M12 16.5h.01" /></>, { size: 36, ...p });
export const Question = (p: P) => svg(<><circle cx="12" cy="12" r="9.5" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7" /><path d="M12 17h.01" /></>, p);
export const Clipboard = (p: P) => svg(<><rect x="8" y="3" width="11" height="14" rx="2" /><path d="M5 7v12a2 2 0 0 0 2 2h9" /></>, p);
export const Backspace = (p: P) => svg(<><path d="M9 5h11v14H9l-6-7 6-7z" /><path d="m12 9 5 6" /><path d="m17 9-5 6" /></>, p);
export const Plus = (p: P) => svg(<><circle cx="12" cy="12" r="9.5" /><path d="M12 8v8" /><path d="M8 12h8" /></>, p);
export const Clock = (p: P) => svg(<><circle cx="12" cy="12" r="9.5" /><path d="M12 7v5l3 2" /></>, p);
