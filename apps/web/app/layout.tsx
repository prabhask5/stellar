import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { ServiceWorker } from "@/components/shell/service-worker";
import { TouchFeelLoader } from "@/components/shell/touch-feel-loader";
import { Starfield } from "@/components/sky/starfield";
import { MotionProvider } from "@/components/ui/motion-provider";
import { UniverseHost } from "@/components/universe/universe-host";
import splash from "@/lib/splash.generated.json";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  // The fallback for platforms without a system font this good. Apple devices (the main
  // target) never use it, so it is not preloaded for everyone.
  preload: false,
  variable: "--font-inter",
  weight: ["200", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Stellar Planner", template: "%s · Stellar Planner" },
  description: "Tasks, goals, routines and focus, with a galaxy of your own behind them.",
  applicationName: "Stellar Planner",
  appleWebApp: {
    capable: true,
    title: "Stellar Planner",
    statusBarStyle: "black-translucent",
    startupImage: splash,
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false, date: false, address: false, email: false },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070615",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The colour is inline so the very first frame is already dark: a stylesheet that arrives a
    // moment later would let the browser's white default show through on launch.
    <html
      lang="en"
      className={inter.variable}
      data-tier="auto"
      style={{ backgroundColor: "#070615" }}
    >
      <body>
        <Starfield />
        <UniverseHost />
        <MotionProvider>
          <div className="sp-shell">{children}</div>
        </MotionProvider>
        <ServiceWorker />
        <TouchFeelLoader />
      </body>
    </html>
  );
}
