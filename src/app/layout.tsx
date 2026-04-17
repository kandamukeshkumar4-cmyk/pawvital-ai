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
  title: "PawVital AI — Dog Symptom Checker",
  description:
    "AI-powered dog symptom triage with a deterministic canine clinical matrix, evidence-backed guidance, and vet-ready reports.",
  keywords: [
    "dog health",
    "veterinary AI",
    "dog symptom checker",
    "canine triage",
    "veterinary diagnosis",
    "dog symptoms",
  ],
  openGraph: {
    title: "PawVital AI — Smart Dog Symptom Checker",
    description:
      "Evidence-based dog symptom triage powered by AI. Analyze symptoms, get differential guidance, and share vet-ready reports.",
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
    title: "PawVital AI — Dog Symptom Checker",
    description:
      "AI-powered dog symptom triage. Evidence-based. Breed-aware. Vet-ready.",
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
