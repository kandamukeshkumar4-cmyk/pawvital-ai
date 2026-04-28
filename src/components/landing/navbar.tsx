"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, PawPrint } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" target="_top" prefetch={false} className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <PawPrint className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">PawVital</span>
            <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
              AI
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              How It Works
            </a>
            <a
              href="#pricing"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Pricing
            </a>
            <a
              href="#faq"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              FAQ
            </a>
            <Link
              href="/login"
              className={buttonClassName({ variant: "ghost", size: "sm" })}
            >
              Log In
            </Link>
            <Link
              href="/symptom-checker"
              className={buttonClassName({
                size: "sm",
                className:
                  "bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/25 focus:ring-emerald-500",
              })}
            >
              Start Free Check
            </Link>
          </div>

          <button
            className="md:hidden p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-gray-200 px-4 py-4 space-y-3">
          <a
            href="#features"
            className="block text-gray-600 py-2"
            onClick={() => setMobileOpen(false)}
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="block text-gray-600 py-2"
            onClick={() => setMobileOpen(false)}
          >
            How It Works
          </a>
          <a
            href="#pricing"
            className="block text-gray-600 py-2"
            onClick={() => setMobileOpen(false)}
          >
            Pricing
          </a>
          <a
            href="#faq"
            className="block text-gray-600 py-2"
            onClick={() => setMobileOpen(false)}
          >
            FAQ
          </a>
          <Link
            href="/login"
            className={buttonClassName({
              variant: "outline",
              className: "w-full",
            })}
          >
            Log In
          </Link>
          <Link
            href="/symptom-checker"
            className={buttonClassName({
              className: "w-full bg-emerald-600 hover:bg-emerald-700",
            })}
          >
            Start Free Check
          </Link>
        </div>
      )}
    </nav>
  );
}
