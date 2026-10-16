import type { Metadata } from "next";

export const metadata: Metadata = { title: "Nonna Mode (sandbox)" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", fontSize: 20, lineHeight: 1.5, margin: "0 auto", maxWidth: 640, padding: 16 }}>
        <p role="note">PayPal sandbox · protects only sends made through Nonna Mode</p>
        {children}
      </body>
    </html>
  );
}
