import type { Metadata, Viewport } from "next";

import { TooltipProvider } from "@/components/ui/overlays";
import { displayFont, uiFont } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avantika & Prateek",
  description: "The wedding of Avantika Chowdhry & Prateek Mehan.",
};

export const viewport: Viewport = {
  themeColor: "#fbf8f3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en-GB"
      className={`${displayFont.variable} ${uiFont.variable}`}
    >
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
