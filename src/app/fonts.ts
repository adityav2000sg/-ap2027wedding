import { Fraunces, Inter } from "next/font/google";

/**
 * Typography.
 *
 * Display — Fraunces. A warm, high-contrast editorial serif with a real optical
 * size axis, so the huge couple lockup on the hero is drawn for display sizes
 * rather than being a body face scaled up. Chosen as the closest freely
 * licensable stand-in for Golden Hour.
 *
 * Script — Edwardian Script ITC, the big title face. Self-hosted from
 * `public/fonts/edwardian-script.woff2` (see `globals.css`) rather than loaded
 * here, because it isn't a Google font.
 *
 * Reserved for names and page titles. Numbers stay on Fraunces — tabular data in
 * a script face is unreadable.
 *
 * UI — Inter, with tracking tightened in CSS. Designed for screen UI at small
 * sizes, which is what this app's density needs.
 *
 * Both are self-hosted by next/font (fetched at build, served from our origin),
 * so there's no third-party request at runtime and no layout shift.
 *
 * There is no speculative Golden Hour webfont declaration. Declaring a file
 * that is not licensed and shipped makes every page issue a visible 404 before
 * falling back; Fraunces is the deliberate production display face.
 */

export const displayFont = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display-loaded",
  // Fraunces is a variable font, so the whole weight range ships in one file and
  // `weight` must be left unset. SOFT rounds the terminals and WONK enables the
  // softer alternates — a little of each reads as warm rather than institutional.
  axes: ["SOFT", "WONK", "opsz"],
});

export const uiFont = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-loaded",
  weight: ["400", "500", "600", "700"],
});
