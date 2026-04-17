import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getCanonicalAppUrl } from "@/lib/env";
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
  metadataBase: new URL(getCanonicalAppUrl() || "http://localhost:3000"),
  title: "PawVital AI — Veterinary Symptom Checker for Dogs & Cats",
  description:
    "AI-powered pet health triage using 10,000+ clinical cases, Merck Veterinary Manual, and breed-specific analysis. Get evidence-based symptom reports in minutes.",
  keywords: [
    "pet health",
    "veterinary AI",
    "dog symptom checker",
    "cat symptom checker",
    "pet triage",
    "veterinary diagnosis",
    "dog health",
    "cat health",
  ],
  openGraph: {
    title: "PawVital AI — Smart Veterinary Symptom Checker",
    description:
      "Evidence-based pet health triage powered by AI. Analyze symptoms, get differential diagnoses, and share reports with your vet.",
    type: "website",
    siteName: "PawVital AI",
    images: [
      {
        url: "/images/og-image.svg",
        width: 1200,
        height: 630,
        alt: "PawVital AI — Veterinary Symptom Checker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PawVital AI — Veterinary Symptom Checker",
    description:
      "AI-powered pet health triage. Evidence-based. Breed-aware. Vet-ready.",
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
