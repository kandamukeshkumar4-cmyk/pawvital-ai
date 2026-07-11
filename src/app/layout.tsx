import type { Metadata } from "next";
import { Geist, Geist_Mono, Hanken_Grotesk } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import {
  isPrivateTesterModeEnabled,
  PRIVATE_TESTER_MODE_RUNTIME_ATTRIBUTE,
} from "@/lib/private-tester-access";
import RecoveryRedirect from "@/components/auth/recovery-redirect";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.pawvital.site"),
  title: "PawVital — Dog Symptom Checker",
  description:
    "Meet your dog's AI health brain — it learns your dog's patterns, spots symptoms early, and suggests the right supplements. Plus instant 2am triage, photo checks, breed-aware guidance, and shareable vet-ready reports. Know what to do, right now.",
  keywords: [
    "dog health",
    "dog symptom checker",
    "canine triage",
    "dog urgency guidance",
    "vet handoff summary",
    "dog supplement safety",
    "dog health tracking",
    "dog symptoms",
  ],
  openGraph: {
    title: "PawVital — Dog Symptom Checker",
    description:
      "Meet your dog's AI health brain — it learns your dog's patterns, spots symptoms early, and suggests the right supplements. Plus instant 2am triage, photo checks, breed-aware guidance, and shareable vet-ready reports. Know what to do, right now.",
    type: "website",
    siteName: "PawVital",
    url: "https://www.pawvital.site",
    images: [
      {
        url: "/images/og-image.svg",
        width: 1200,
        height: 630,
        alt: "PawVital dog symptom checker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PawVital — Dog Symptom Checker",
    description:
      "Meet your dog's AI health brain — it learns your dog's patterns, spots symptoms early, and suggests the right supplements. Plus instant 2am triage, photo checks, breed-aware guidance, and shareable vet-ready reports. Know what to do, right now.",
    images: ["/images/og-image.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const privateTesterModeEnabled = isPrivateTesterModeEnabled();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${hankenGrotesk.variable} h-full antialiased`}
    >
      <body
        className="min-h-full flex flex-col"
        {...{
          [PRIVATE_TESTER_MODE_RUNTIME_ATTRIBUTE]: privateTesterModeEnabled
            ? "1"
            : "0",
        }}
      >
        <RecoveryRedirect />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
