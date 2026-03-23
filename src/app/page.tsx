import Navbar from "@/components/landing/navbar";
import Hero from "@/components/landing/hero";
import Features from "@/components/landing/features";
import StorySection from "@/components/landing/story-section";
import Testimonials from "@/components/landing/testimonials";
import Pricing from "@/components/landing/pricing";
import CTA from "@/components/landing/cta";
import Footer from "@/components/landing/footer";

export default function HomePage() {
  return (
    <main>
      <Navbar />
      <Hero />
      <Features />
      <div id="story">
        <StorySection />
      </div>
      <Testimonials />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  );
}
