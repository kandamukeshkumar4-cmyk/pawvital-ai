import Link from "next/link";
import { PawPrint, Mail } from "lucide-react";

export const metadata = {
  title: "Contact — PawVital AI",
  description: "Get in touch with the PawVital team.",
};

export default function ContactPage() {
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

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-3xl font-bold text-white mb-4">Contact us</h1>
        <p className="text-gray-400 mb-10">
          We&apos;re a small team. The fastest way to reach us is email — we aim to reply within
          one business day.
        </p>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-emerald-900 rounded-lg flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold mb-1">Email support</h2>
              <a
                href="mailto:kandasubbarao4@gmail.com"
                className="text-emerald-400 hover:text-emerald-300 transition-colors text-lg"
              >
                kandasubbarao4@gmail.com
              </a>
              <p className="text-gray-500 text-sm mt-2">
                For billing, account issues, feedback, or data deletion requests.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 p-6 bg-amber-950/40 border border-amber-800/40 rounded-xl">
          <p className="text-amber-400 font-medium mb-1">Veterinary emergency?</p>
          <p className="text-gray-400 text-sm">
            If your dog needs urgent care, do not wait for a reply — contact your vet or
            nearest emergency animal hospital immediately. PawVital is triage guidance, not
            emergency dispatch.
          </p>
        </div>

        <div className="mt-10 space-y-2 text-sm text-gray-500">
          <p>
            Looking for our{" "}
            <Link href="/privacy" className="text-emerald-400 hover:text-emerald-300 transition-colors">
              Privacy Policy
            </Link>{" "}
            or{" "}
            <Link href="/terms" className="text-emerald-400 hover:text-emerald-300 transition-colors">
              Terms of Service
            </Link>
            ?
          </p>
        </div>
      </main>

      <footer className="border-t border-gray-800 mt-20 py-8 text-center text-sm text-gray-600">
        <p>
          <Link href="/" className="hover:text-gray-400 transition-colors">Home</Link>
          {" · "}
          <Link href="/privacy" className="hover:text-gray-400 transition-colors">Privacy</Link>
          {" · "}
          <Link href="/terms" className="hover:text-gray-400 transition-colors">Terms</Link>
        </p>
      </footer>
    </div>
  );
}
