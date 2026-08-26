import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Accent tones are stored as plain strings on events, categories and members.
 * This maps them onto the design tokens so a tone is always rendered the same
 * way, and an unknown tone degrades to saffron rather than to nothing.
 */
export const TONES = [
  // Event accents — each function has its own identifying colour.
  "haldi", "mehendi", "sangeet", "shaadi", "reception",
  // General accents.
  "saffron", "rose", "olive", "indigo", "plum", "teal", "sky", "amber", "slate",
] as const;

export type Tone = (typeof TONES)[number];

export function toTone(value: string | null | undefined): Tone {
  return TONES.includes(value as Tone) ? (value as Tone) : "saffron";
}

const TONE_CLASSES: Record<Tone, { text: string; bg: string; border: string; dot: string }> = {
  haldi: { text: "text-haldi", bg: "bg-haldi-soft", border: "border-haldi/25", dot: "bg-haldi" },
  mehendi: { text: "text-mehendi", bg: "bg-mehendi-soft", border: "border-mehendi/25", dot: "bg-mehendi" },
  sangeet: { text: "text-sangeet", bg: "bg-sangeet-soft", border: "border-sangeet/25", dot: "bg-sangeet" },
  shaadi: { text: "text-shaadi", bg: "bg-shaadi-soft", border: "border-shaadi/25", dot: "bg-shaadi" },
  reception: { text: "text-reception", bg: "bg-reception-soft", border: "border-reception/25", dot: "bg-reception" },
  saffron: { text: "text-saffron", bg: "bg-saffron-soft", border: "border-saffron/25", dot: "bg-saffron" },
  rose: { text: "text-rose", bg: "bg-rose-soft", border: "border-rose/25", dot: "bg-rose" },
  olive: { text: "text-olive", bg: "bg-olive-soft", border: "border-olive/25", dot: "bg-olive" },
  indigo: { text: "text-indigo", bg: "bg-indigo-soft", border: "border-indigo/25", dot: "bg-indigo" },
  plum: { text: "text-plum", bg: "bg-plum-soft", border: "border-plum/25", dot: "bg-plum" },
  teal: { text: "text-teal", bg: "bg-teal-soft", border: "border-teal/25", dot: "bg-teal" },
  sky: { text: "text-sky", bg: "bg-sky-soft", border: "border-sky/25", dot: "bg-sky" },
  amber: { text: "text-amber", bg: "bg-amber-soft", border: "border-amber/25", dot: "bg-amber" },
  slate: { text: "text-slate", bg: "bg-slate-soft", border: "border-slate/25", dot: "bg-slate" },
};

export function toneClasses(tone: string | null | undefined) {
  return TONE_CLASSES[toTone(tone)];
}

/** Hex values for tones, needed by inline SVG (progress rings, charts). */
export const TONE_HEX: Record<Tone, string> = {
  haldi: "#c08a2e",
  mehendi: "#6f7f56",
  sangeet: "#7c6288",
  shaadi: "#9d4a58",
  reception: "#b8734f",
  saffron: "#bd6b3a",
  rose: "#9d4a58",
  olive: "#6f7f56",
  indigo: "#4b5474",
  plum: "#7c6288",
  teal: "#3d7770",
  sky: "#4e7392",
  amber: "#b08029",
  slate: "#64748b",
};

export const SEVERITY_HEX = {
  critical: "#a63a3a",
  important: "#c2703d",
  attention: "#b5852f",
  info: "#4f7595",
} as const;

/** Initials for avatars — "Avantika Malhotra" -> "AM". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
