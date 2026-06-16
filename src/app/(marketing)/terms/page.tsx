import Link from "next/link";
import { PawPrint } from "lucide-react";

export const metadata = {
  title: "Terms of Service — PawVital AI",
  description: "Terms governing your use of PawVital AI.",
};

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-10">Effective date: June 16, 2026</p>

        <div className="space-y-10 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Not veterinary advice</h2>
            <p className="font-medium text-amber-400">
              PawVital is not a veterinarian and does not provide veterinary diagnosis or
              treatment. Output is triage guidance only.
            </p>
            <p className="mt-2">
              If your dog is in immediate danger — struggling to breathe, collapsed, bleeding
              heavily, having seizures, or unable to urinate — contact a veterinarian or
              emergency animal hospital immediately. Do not use PawVital as a substitute for
              emergency care.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Eligibility</h2>
            <p>
              You must be 18 or older to create an account. By using PawVital you confirm you
              are not using the service on behalf of a veterinary practice for clinical
              diagnosis.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Account</h2>
            <p>
              You are responsible for keeping your login credentials secure. Notify us
              immediately if you suspect unauthorized use of your account. We reserve the right
              to suspend accounts that violate these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>Attempt to extract or reverse-engineer the clinical matrix</li>
              <li>Abuse the API or submit automated bulk requests</li>
              <li>Upload content that is illegal or violates third-party rights</li>
              <li>Misrepresent PawVital output as a formal veterinary diagnosis</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Subscription and billing</h2>
            <p>
              Paid plans are billed monthly. You may cancel at any time from your account
              settings. Cancellation takes effect at the end of the current billing period.
              We do not offer prorated refunds for partial months unless required by applicable
              law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Limitation of liability</h2>
            <p>
              To the fullest extent permitted by law, PawVital and its operators are not liable
              for any harm to your pet arising from reliance on triage guidance provided by the
              service. Use PawVital as one input among many — your vet has the full picture.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Changes to these terms</h2>
            <p>
              We may update these terms at any time. We will notify registered users by email
              and update the effective date above. Continued use after changes constitutes
              acceptance.
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
          <Link href="/privacy" className="hover:text-gray-400 transition-colors">Privacy</Link>
          {" · "}
          <Link href="/contact" className="hover:text-gray-400 transition-colors">Contact</Link>
        </p>
      </footer>
    </div>
  );
}
