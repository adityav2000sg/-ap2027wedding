import { Fraunces, Inter } from "next/font/google";

/**
 * Typography.
 *
 * Display — Fraunces. A warm, high-contrast editorial serif with a real optical
 * size axis, so the huge couple lockup on the hero is drawn for display sizes
 * rather than being a body face scaled up. Chosen as the closest freely
 * licensable stand-in for Golden Hour.
 *
 * UI — Inter, with tracking tightened in CSS. Designed for screen UI at small
 * sizes, which is what this app's density needs.
 *
 * Both are self-hosted by next/font (fetched at build, served from our origin),
 * so there's no third-party request at runtime and no layout shift.
 *
 * Golden Hour, if you have a licence for it, is wired up in `globals.css` as a
 * plain `@font-face` pointing at `public/fonts/golden-hour.woff2`. CSS ignores a
 * font file that isn't there and falls through to Fraunces, so dropping the file
 * in is the only step needed to switch the whole app over.
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
