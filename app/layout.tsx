import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { InstallPrompt } from "@/components/InstallPrompt";
import { LiveProvider } from "@/components/LiveProvider";
import { Nav } from "@/components/Nav";
import { ProcessingBar } from "@/components/ProcessingBar";
import { PwaRegister } from "@/components/PwaRegister";
import { loadState } from "@/lib/store";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070B16",
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  let title = "TNHVPL";
  let appleTitle = "TNHVPL";
  try {
    const state = await loadState();
    title = state.meta?.name || state.config.tournament.name || title;
    appleTitle = state.meta?.short || state.config.tournament.short || appleTitle;
  } catch {
    /* cold start */
  }

  return {
    title,
    description: "Live scores, fixtures and points table for TNH Volleyball",
    applicationName: title,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: appleTitle,
    },
    formatDetection: { telephone: false },
    icons: {
      icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    other: {
      "mobile-web-app-capable": "yes",
    },
  };
}

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
            <InstallPrompt />
            <PwaRegister />
          </LiveProvider>
        </Suspense>
      </body>
    </html>
  );
}
