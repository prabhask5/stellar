import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { ServiceWorker } from "@/components/shell/service-worker";
import { Starfield } from "@/components/sky/starfield";
import { UniverseHost } from "@/components/universe/universe-host";
import splash from "@/lib/splash.generated.json";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["200", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Stellar Planner", template: "%s · Stellar Planner" },
  description: "Tasks, goals, routines and focus, in a universe that grows with you.",
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
    <html lang="en" className={inter.variable} data-tier="auto">
      <body>
        <Starfield />
        <UniverseHost />
        <div className="sp-shell">{children}</div>
        <ServiceWorker />
      </body>
    </html>
  );
}
