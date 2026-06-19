# PawVital AI — Design System (locked)

This is the canonical visual contract for every owner-facing tab. Tokens here are
**extracted from shipped code** (`src/components/dog-brain/health-brief.tsx`), not
invented. New screens must reuse these tokens. No purple/chatbot styling. No fake
health scores. Real data or an honest empty state only.

## 1. Principles

- **White clinical UI.** Page background white / near-white; content lives in
  compact bordered cards. Calm, medical, legible — not a consumer chat app.
- **Green is the brand + primary action.** Reserved for primary buttons, active
  nav, and the "stable/good" state.
- **Mint is the active/positive surface** (selected states, good-signal tint).
- **Amber means Watch** — a noticed change, not an emergency.
- **Red is emergency only** — red-flag escalation, "needs attention", emergency
  guidance. Never decorative.
- **Every Brain card shows its source** (daily log / symptom check / journal /
  photo / vet record / medication / reminder) and never lowers deterministic urgency.

## 2. Color tokens (source of truth)

### State system
| State | Label | Line/accent | Foreground | Background |
|---|---|---|---|---|
| `stable` | Stable | `#1f9d6b` | `#15795a` | `#e7f4ee` |
| `watch` | Watch | `#e8a23c` | `#c1852a` | `#fbf0db` |
| `needs_attention` | Needs attention | `#e2675b` | `#b8473c` | `#fbeae8` |

### Signal severity
| Severity | Foreground | Background | Line |
|---|---|---|---|
| `info` | `#4f7fb8` | `#e9f1fa` | `#4f7fb8` |
| `watch` | `#c1852a` | `#fbf0db` | `#e8a23c` |
| `alert` | `#b8473c` | `#fbeae8` | `#e2675b` |

### Neutrals & brand
| Role | Value |
|---|---|
| Brand / primary green | `#1f9d6b` |
| Primary green (hover) | `#15795a` |
| Mint surface (active/positive) | `#f3f9f6` |
| Mint surface (state bg) | `#e7f4ee` |
| Secondary button border | `#cfe6da` |
| Card border | `#eef1ef` |
| Text primary | `#1c2522` |
| Text muted | `#8a978f` |
| Page surface | `#ffffff` |

## 3. Components

- **Card:** `rounded-2xl border border-[#eef1ef] bg-white` (outer), `rounded-xl`
  for inner cards. Section eyebrow label: `text-[10px] font-semibold uppercase
  tracking-widest text-[#8a978f]`.
- **Primary button:** `rounded-lg bg-[#1f9d6b] px-4 py-2.5 text-sm font-medium
  text-white hover:bg-[#15795a]`.
- **Secondary button:** `rounded-lg border border-[#cfe6da] bg-white px-4 py-2.5
  text-sm font-medium text-[#15795a] hover:bg-[#f3f9f6]`.
- **Pill/badge:** `rounded-full px-2 py-0.5 text-[11px] font-semibold`, colored by
  state/severity bg+fg.
- **Body text:** primary `#1c2522`; secondary/meta `#8a978f`.

## 4. Layout (web, not mobile-locked)

- Dashboard: `max-w-7xl` 3-column (main brief + right rail).
- Health Signals: `max-w-5xl`+ wide grid.
- Centered single-column tabs (Daily Log, Supplements) use a `2xl` content column —
  a valid web treatment, not a phone frame.
- Left sidebar nav + top bar (pet switcher, last-log status, primary CTA) on every tab.

## 5. Per-tab structure (matches approved mockups)

- **Dashboard / Health Brief:** Today's Health Brief (state + main reason),
  "What PawVital noticed" signal cards w/ sparklines, Pattern Timeline, right rail
  = Next Best Action + Upcoming Reminders (live `/api/reminders`) + Share-with-vet.
- **Symptom Checker:** red emergency banner, Dog Brain context strip (counts),
  chat with "Why I'm asking", "What PawVital remembers" rail, final report preview.
- **Daily Log:** Today's baseline emoji selectors, Adaptive packs (GI/Urinary/
  Mobility/Skin-Ear/Breathing/Episode/Medication), photo upload, "What the Brain
  will remember" rail, check-in preview timeline.
- **Health Signals:** current state, 90-day memory counts, 14-day signal grid,
  Pattern Timeline, "What changed from normal", "What to tell your vet".
- **Supplements:** Active / Ask-vet / Follow-ups tabs, vet-safe rules, Brain
  evidence, "Create vet-safe summary". No dosing/start/stop advice.

## 6. Hard rules

- No purple, no generic AI-chatbot chrome.
- No fake/static health data in live mode — wire to an API or show an honest empty
  state ("teach the Brain") with no fabricated analytics.
- Deterministic clinical urgency is authoritative; owner-reported memory is
  supportive context only and must never lower urgency.
- Emergency/red-flag escalation always reachable, even when recent logs look normal.
