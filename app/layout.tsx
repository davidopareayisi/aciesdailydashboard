import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./learning.css";
import "./editorial.css";
const geist = localFont({ src: "./fonts/geist-latin.woff2", variable: "--font-geist", display: "swap", weight: "100 900" });
export const metadata: Metadata = { title: "AciesDaily — In good company", description: "Your creative work, people and productions. The AciesDaily portal.", robots: { index: false, follow: false }, referrer: "no-referrer", manifest: "/manifest.webmanifest", appleWebApp: { capable: true, statusBarStyle: "default", title: "AciesDaily" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f8f7f3", colorScheme: "light" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en" className={geist.variable}><body>{children}</body></html>; }
