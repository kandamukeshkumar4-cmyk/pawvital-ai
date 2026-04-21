import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PawVital — Dog Symptom Checker",
  description:
    "Dog symptom triage support with urgency guidance, a deterministic canine clinical matrix, and vet-ready handoff summaries.",
  keywords: [
    "dog health",
    "dog symptom checker",
    "canine triage",
    "dog urgency guidance",
    "vet handoff summary",
    "dog symptoms",
  ],
  openGraph: {
    title: "PawVital — Dog Symptom Checker",
    description:
      "Evidence-based dog symptom triage support with clear urgency guidance and vet-ready handoff summaries.",
    type: "website",
    siteName: "PawVital",
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
      "Dog symptom triage support with evidence-based urgency guidance and vet-ready handoff summaries.",
    images: ["/images/og-image.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
