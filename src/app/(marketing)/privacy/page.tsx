import Link from "next/link";
import { PawPrint } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — PawVital AI",
  description: "How PawVital collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-300">
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <PawPrint className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-bold text-lg">PawVital AI</span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">Effective date: June 16, 2026</p>

        <div className="space-y-10 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. What we collect</h2>
            <p>
              When you create an account we collect your email address and the password hash
              managed by Supabase Auth. When you use the symptom checker we store the
              conversation history, extracted symptom data, urgency assessments, and any photos
              you upload — all associated with your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. How we use it</h2>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>To operate the symptom triage and vet-handoff report features</li>
              <li>To send account and session notifications you have opted into</li>
              <li>To improve the accuracy of our canine clinical matrix (anonymised, aggregated only)</li>
              <li>To fulfil legal obligations and prevent abuse</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Storage and security</h2>
            <p>
              Data is stored in Supabase (PostgreSQL) with row-level security policies that
              prevent any user from reading another user&apos;s records. Images are stored in
              Supabase Storage with per-owner access controls. We use HTTPS for all data in
              transit.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Third-party services</h2>
            <p>We use the following third-party services to operate PawVital:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>
                <strong className="text-gray-100">Supabase</strong> — database, auth, and file
                storage
              </li>
              <li>
                <strong className="text-gray-100">Vercel</strong> — hosting and edge functions
              </li>
              <li>
                <strong className="text-gray-100">Anthropic / Azure OpenAI</strong> — AI model
                inference (your symptom text is sent to these services)
              </li>
              <li>
                <strong className="text-gray-100">Stripe</strong> — payment processing (we do
                not store card numbers)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Your rights</h2>
            <p>
              You may request export or deletion of your data at any time by emailing{" "}
              <a
                href="mailto:kandasubbarao4@gmail.com"
                className="text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                kandasubbarao4@gmail.com
              </a>
              . We will action deletion requests within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Children</h2>
            <p>PawVital is not directed at children under 13 and we do not knowingly collect data from them.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Changes</h2>
            <p>
              We will post any changes here with an updated effective date. Continued use after
              the date constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Contact</h2>
            <p>
              Questions?{" "}
              <Link href="/contact" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                Contact us
              </Link>{" "}
              or email{" "}
              <a
                href="mailto:kandasubbarao4@gmail.com"
                className="text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                kandasubbarao4@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-gray-800 mt-20 py-8 text-center text-sm text-gray-600">
        <p>
          <Link href="/" className="hover:text-gray-400 transition-colors">Home</Link>
          {" · "}
          <Link href="/terms" className="hover:text-gray-400 transition-colors">Terms</Link>
          {" · "}
          <Link href="/contact" className="hover:text-gray-400 transition-colors">Contact</Link>
        </p>
      </footer>
    </div>
  );
}
