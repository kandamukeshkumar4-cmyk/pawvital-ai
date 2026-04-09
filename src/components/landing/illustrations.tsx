 

/** Pure SVG illustration components for the landing page.
 *  All use the app palette: emerald, blue, amber, indigo.
 *  No external files — render inline only.                */

export function SymptomChatIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Background card */}
      <rect x="20" y="20" width="280" height="200" rx="16" fill="#f0fdf4" stroke="#bbf7d0" strokeWidth="1.5" />

      {/* User message bubble */}
      <rect x="120" y="45" width="160" height="44" rx="12" fill="#dbeafe" />
      <text x="140" y="65" fontSize="11" fill="#1e40af" fontFamily="system-ui">My dog has been</text>
      <text x="140" y="80" fontSize="11" fill="#1e40af" fontFamily="system-ui">limping on his back leg</text>

      {/* AI response bubble */}
      <rect x="40" y="105" width="200" height="56" rx="12" fill="#10b981" />
      <text x="55" y="125" fontSize="11" fill="#ffffff" fontFamily="system-ui">I&apos;ll help you assess that.</text>
      <text x="55" y="140" fontSize="11" fill="#ecfdf5" fontFamily="system-ui">How long has the limping</text>
      <text x="55" y="153" fontSize="11" fill="#ecfdf5" fontFamily="system-ui">been going on?</text>

      {/* Typing indicator */}
      <circle cx="55" cy="185" r="4" fill="#6ee7b7">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="70" cy="185" r="4" fill="#6ee7b7">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.4s" begin="0.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="85" cy="185" r="4" fill="#6ee7b7">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.4s" begin="0.4s" repeatCount="indefinite" />
      </circle>

      {/* Paw icon */}
      <circle cx="275" cy="190" r="14" fill="#d1fae5" />
      <path d="M269 192a3 3 0 1 1 3-3 M275 188a3 3 0 1 1 3-3 M281 192a3 3 0 1 1 3-3 M275 196a5 5 0 0 1-4-3 5 5 0 0 1 8 0 5 5 0 0 1-4 3z" fill="#059669" />
    </svg>
  );
}

export function DiagnosisReportIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Report card */}
      <rect x="30" y="15" width="260" height="210" rx="14" fill="#ffffff" stroke="#e5e7eb" strokeWidth="1.5" />

      {/* Header bar */}
      <rect x="30" y="15" width="260" height="40" rx="14" fill="#059669" />
      <rect x="30" y="41" width="260" height="14" fill="#059669" />
      <text x="55" y="41" fontSize="14" fill="#ffffff" fontWeight="bold" fontFamily="system-ui">Diagnosis Report</text>
      <circle cx="270" cy="35" r="10" fill="#34d399" />
      <path d="M265 35l3 3 7-7" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* SOAP sections */}
      <text x="50" y="78" fontSize="10" fill="#059669" fontWeight="bold" fontFamily="system-ui">SUBJECTIVE</text>
      <rect x="50" y="83" width="140" height="4" rx="2" fill="#d1fae5" />
      <rect x="50" y="91" width="100" height="4" rx="2" fill="#ecfdf5" />

      <text x="50" y="115" fontSize="10" fill="#2563eb" fontWeight="bold" fontFamily="system-ui">ASSESSMENT</text>
      <rect x="50" y="120" width="180" height="4" rx="2" fill="#dbeafe" />
      <rect x="50" y="128" width="130" height="4" rx="2" fill="#eff6ff" />

      {/* Urgency badge */}
      <rect x="50" y="148" width="80" height="22" rx="11" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1" />
      <text x="65" y="163" fontSize="10" fill="#92400e" fontFamily="system-ui">⚡ Moderate</text>

      {/* Differential diagnoses list */}
      <text x="150" y="158" fontSize="10" fill="#6b7280" fontFamily="system-ui">Differentials:</text>
      <circle cx="158" cy="172" r="3" fill="#10b981" />
      <text x="165" y="175" fontSize="9" fill="#374151" fontFamily="system-ui">Osteoarthritis (72%)</text>
      <circle cx="158" cy="188" r="3" fill="#f59e0b" />
      <text x="165" y="191" fontSize="9" fill="#374151" fontFamily="system-ui">Soft tissue injury (18%)</text>
      <circle cx="158" cy="204" r="3" fill="#ef4444" />
      <text x="165" y="207" fontSize="9" fill="#374151" fontFamily="system-ui">ACL tear (10%)</text>

      {/* Evidence tag */}
      <rect x="50" y="195" width="90" height="18" rx="9" fill="#ede9fe" />
      <text x="60" y="207" fontSize="8" fill="#5b21b6" fontFamily="system-ui">📚 Merck Verified</text>
    </svg>
  );
}

export function VisionAnalysisIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Image frame */}
      <rect x="40" y="30" width="180" height="180" rx="16" fill="#faf5ff" stroke="#c4b5fd" strokeWidth="1.5" />

      {/* Placeholder "photo" */}
      <rect x="55" y="50" width="150" height="120" rx="10" fill="#ede9fe" />
      <circle cx="100" cy="95" r="20" fill="#c4b5fd" opacity="0.5" />
      <circle cx="155" cy="110" r="15" fill="#a78bfa" opacity="0.4" />

      {/* Scan lines */}
      <line x1="55" y1="80" x2="205" y2="80" stroke="#7c3aed" strokeWidth="1" strokeDasharray="4 3" opacity="0.5">
        <animate attributeName="y1" values="50;170;50" dur="3s" repeatCount="indefinite" />
        <animate attributeName="y2" values="50;170;50" dur="3s" repeatCount="indefinite" />
      </line>

      {/* Analysis panel */}
      <rect x="230" y="40" width="70" height="160" rx="10" fill="#ffffff" stroke="#e5e7eb" strokeWidth="1" />
      <text x="242" y="60" fontSize="8" fill="#7c3aed" fontWeight="bold" fontFamily="system-ui">ANALYSIS</text>

      {/* Confidence bars */}
      <rect x="240" y="72" width="50" height="6" rx="3" fill="#f3f4f6" />
      <rect x="240" y="72" width="42" height="6" rx="3" fill="#10b981" />
      <text x="240" y="90" fontSize="7" fill="#6b7280" fontFamily="system-ui">Dermatitis</text>

      <rect x="240" y="102" width="50" height="6" rx="3" fill="#f3f4f6" />
      <rect x="240" y="102" width="30" height="6" rx="3" fill="#f59e0b" />
      <text x="240" y="120" fontSize="7" fill="#6b7280" fontFamily="system-ui">Hot spot</text>

      <rect x="240" y="132" width="50" height="6" rx="3" fill="#f3f4f6" />
      <rect x="240" y="132" width="15" height="6" rx="3" fill="#ef4444" />
      <text x="240" y="150" fontSize="7" fill="#6b7280" fontFamily="system-ui">Ringworm</text>

      {/* Match count */}
      <rect x="237" y="165" width="56" height="24" rx="8" fill="#f0fdf4" stroke="#86efac" strokeWidth="1" />
      <text x="245" y="181" fontSize="8" fill="#059669" fontFamily="system-ui">9,700+</text>
      <text x="245" y="191" fontSize="6" fill="#6b7280" fontFamily="system-ui" />

      {/* Camera icon */}
      <circle cx="130" cy="195" r="10" fill="#7c3aed" />
      <rect x="124" y="190" width="12" height="8" rx="2" fill="#ffffff" />
      <circle cx="130" cy="194" r="3" fill="#7c3aed" />
    </svg>
  );
}

export function HealthTimelineIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Background card */}
      <rect x="20" y="15" width="280" height="210" rx="14" fill="#fffbeb" stroke="#fde68a" strokeWidth="1" />

      {/* Timeline vertical line */}
      <line x1="80" y1="45" x2="80" y2="205" stroke="#d1d5db" strokeWidth="2" strokeDasharray="4 2" />

      {/* Timeline events */}
      {/* Event 1 - green */}
      <circle cx="80" cy="55" r="8" fill="#10b981" />
      <circle cx="80" cy="55" r="4" fill="#ffffff" />
      <text x="100" y="52" fontSize="10" fill="#374151" fontWeight="bold" fontFamily="system-ui">Jan 15</text>
      <text x="100" y="64" fontSize="9" fill="#6b7280" fontFamily="system-ui">Wellness check — All clear</text>
      <rect x="100" y="69" width="60" height="4" rx="2" fill="#d1fae5" />

      {/* Event 2 - amber */}
      <circle cx="80" cy="100" r="8" fill="#f59e0b" />
      <circle cx="80" cy="100" r="4" fill="#ffffff" />
      <text x="100" y="97" fontSize="10" fill="#374151" fontWeight="bold" fontFamily="system-ui">Feb 2</text>
      <text x="100" y="109" fontSize="9" fill="#6b7280" fontFamily="system-ui">Limping noticed — Moderate</text>
      <rect x="100" y="114" width="80" height="4" rx="2" fill="#fef3c7" />

      {/* Event 3 - blue */}
      <circle cx="80" cy="145" r="8" fill="#3b82f6" />
      <circle cx="80" cy="145" r="4" fill="#ffffff" />
      <text x="100" y="142" fontSize="10" fill="#374151" fontWeight="bold" fontFamily="system-ui">Feb 10</text>
      <text x="100" y="154" fontSize="9" fill="#6b7280" fontFamily="system-ui">Vet visit — X-ray normal</text>
      <rect x="100" y="159" width="100" height="4" rx="2" fill="#dbeafe" />

      {/* Event 4 - green */}
      <circle cx="80" cy="190" r="8" fill="#10b981" />
      <circle cx="80" cy="190" r="4" fill="#ffffff" />
      <text x="100" y="187" fontSize="10" fill="#374151" fontWeight="bold" fontFamily="system-ui">Mar 1</text>
      <text x="100" y="199" fontSize="9" fill="#6b7280" fontFamily="system-ui">Improvement — Supplements working</text>
      <rect x="100" y="204" width="70" height="4" rx="2" fill="#d1fae5" />

      {/* Trend arrow */}
      <path d="M260 180 L270 50" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
      <path d="M265 55 L270 50 L275 57" stroke="#10b981" strokeWidth="2" fill="none" strokeLinecap="round" />
      <text x="250" y="195" fontSize="8" fill="#059669" fontFamily="system-ui">Improving</text>
    </svg>
  );
}

export function PawPrintPattern({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <pattern id="pawPattern" x="0" y="0" width="50" height="50" patternUnits="userSpaceOnUse">
          {/* Main pad */}
          <ellipse cx="25" cy="32" rx="8" ry="7" fill="#10b981" opacity="0.06" />
          {/* Toe pads */}
          <circle cx="15" cy="20" r="4" fill="#10b981" opacity="0.06" />
          <circle cx="25" cy="16" r="4" fill="#10b981" opacity="0.06" />
          <circle cx="35" cy="20" r="4" fill="#10b981" opacity="0.06" />
        </pattern>
      </defs>
      <rect width="200" height="200" fill="url(#pawPattern)" />
    </svg>
  );
}
