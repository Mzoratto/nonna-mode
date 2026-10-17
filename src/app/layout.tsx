import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import { timeScale } from "@/server/time";
import "./globals.css";

// Designed for low-vision readers; also gives the slashed zero seen in the comps.
const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin"], weight: ["400", "600", "800"], variable: "--font-atkinson" });

export const metadata: Metadata = { title: "Nonna Mode (PayPal sandbox)" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1d4e47" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const scale = timeScale();
  return (
    <html lang="en" className={atkinson.variable}>
      <body>
        {children}
        {scale !== 1 && <span className="demo-badge">Demo timing ×{scale}</span>}
      </body>
    </html>
  );
}
