import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { LiveProvider } from "@/components/LiveProvider";
import { Nav } from "@/components/Nav";
import { ProcessingBar } from "@/components/ProcessingBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "TNHVPL",
  description: "Live scores, fixtures and points table for TNH Volleyball",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070B16",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <Suspense fallback={<main className="wrap"><div className="empty">Loading…</div></main>}>
          <LiveProvider>
            <Nav />
            <ProcessingBar />
            <main className="wrap">{children}</main>
          </LiveProvider>
        </Suspense>
      </body>
    </html>
  );
}
