import Navbar from "@/components/landing/navbar";
import Hero from "@/components/landing/hero";
import HowItWorks from "@/components/landing/how-it-works";
import Features from "@/components/landing/features";
import Testimonials from "@/components/landing/testimonials";
import ComparisonTable from "@/components/landing/comparison-table";
import Pricing from "@/components/landing/pricing";
import Faq from "@/components/landing/faq";
import CTA from "@/components/landing/cta";
import Footer from "@/components/landing/footer";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "PawVital",
  applicationCategory: "HealthApplication",
  operatingSystem: "Web",
  description:
    "Dog symptom triage support with evidence-based canine urgency guidance and vet-ready handoff summaries.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <main>
        <Navbar />
        <Hero />
        <HowItWorks />
        <Features />
        <Testimonials />
        <ComparisonTable />
        <Pricing />
        <Faq />
        <CTA />
        <Footer />
      </main>
    </>
  );
}
