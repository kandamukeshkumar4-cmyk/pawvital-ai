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
  title: "PawVital AI - Your Pet's AI Wellness Companion",
  description:
    "Stop Googling your dog's symptoms at 2am. PawVital AI gives you a 24/7 pet health companion that tracks wellness, checks symptoms, and tells you exactly what to do. $9.97/month.",
  keywords: [
    "pet health",
    "dog wellness",
    "AI pet care",
    "symptom checker",
    "pet supplements",
    "dog health app",
  ],
  openGraph: {
    title: "PawVital AI - Your Pet's AI Wellness Companion",
    description:
      "24/7 AI-powered pet health dashboard, symptom checker, and personalized wellness plans. Less than $10/month.",
    type: "website",
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
