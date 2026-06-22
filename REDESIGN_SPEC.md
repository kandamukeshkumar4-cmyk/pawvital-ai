# PawVital Redesign Spec (screens 2–5) — internal, do not ship-link

Global tokens already wired in globals.css (.app-dark): brand green #0b7a4d, bright #15a06a,
green tint #e9f6ef, gradient linear-gradient(180deg,#17a06d,#0a7048), page #f5f5f7, card #fff,
text #1d1d1b, muted #6f7069, border #ebeae5/#efeee9, input #e6e5e0, warn #e0890a/#b5740a/#fdf3e3,
danger #cf4338/#fdeeec, info #4d7cb5/#3a5a82/#f0f5fb. Font: Hanken Grotesk (global).
Elevated card: radius 20, shadow 0 1px 3px rgba(0,0,0,.06),0 4px 18px rgba(0,0,0,.07).
Flat/board card: radius 14-16, 1px solid #ebeae5, no shadow.
Status colors: Good #15a06a · Watch #e0890a · Alert #d64545 · No-data #c8c9c0/#cbccc3.
Chart gridlines: amber #F0EAD6, green #D8EDE4, blue #D8E4F4 (stroke 0.6). Bars w8 r3.
Left-accent strip: border-left 3px solid <state>; radius 0 10px 10px 0; tinted bg.
Underline tabs: active #0b7a4d/600 + 2px solid #0b7a4d; inactive #85867e/500.
Toggle: track 46x26 r13, knob 20px white; on #15a06a off #cfd0c8.

## CRITICAL — EMPTY STATES / NO MOCK DATA (applies to every screen)
The mockup shows fake "Bruno" data everywhere. DO NOT reproduce any hardcoded numbers, names,
dates, log rows, chart values, or sample items. Render ONLY real data the component already has.
Where the mockup shows populated data and the real component has none:
- Grid/chart cells with no data: render em-dash "—" in #cbccc3 (no-data dot #c8c9c0).
- For a new user / sparse data: show a clearly-LABELED preview, e.g. an eyebrow "PREVIEW" +
  text "Log ~14 days and your chart will look like this" with an EXAMPLE chart that is visually
  marked as an example (reduced opacity + a "Example" tag). It must be obvious it is NOT real data.
- Real (even low) counts are fine to show; never inflate them.

---
(Health Signals / Daily Log / Supplements / Dashboard detailed specs follow — see chat history;
implementers: request the relevant section. Key per-screen layout summarized below.)

## HEALTH SIGNALS (/analytics)
H1 "{Dog}'s Health Signals" 29/700 + subtitle. Status strip (CURRENT STATE / 90-DAY MEMORY /
stat blocks). Two-col: left = 14-DAY SIGNAL GRID card (7 rows: Appetite/Water/Stool/Urination/
Vomiting/Energy/Weight × 15 day-cols; face/arrow glyphs by state; em-dash for no-data) + PATTERN
TIMELINE card (icon-tile rows, category chips). Right rail 344px = "What changed from normal"
(left-accent strips), vet-packet "What to tell your vet" (Copy/Create buttons), "What to log next"
checklist. EMPTY: empty grid = all em-dash; show labeled "log 14 days" preview.

## DAILY LOG (/health-log)
H1 "{Dog} Daily check-in" + "Save check-in" gradient btn. 3 cols: (1) Today's baseline — metric
rows w/ 3-segment face selector (selected green #e8f6ee/#bfe6d0 or amber #fdf3e3/#f0cd8e; unselected
#c8c9c0), weight input + sparkline, specific-observations textarea. (2) Adaptive packs — underline
tabs GI/Urinary/Mobility/Skin-Ear/Breathing/Episode/Medication; checkbox lists; notes; photo
upload (striped thumb + dashed dropzone). (3) "What the Brain will remember" — left-accent strips +
next-action checklist. Below: "Today's check-in preview" stepper. EMPTY: all segments unselected.

## SUPPLEMENTS (/supplements)
H1 "Vet-safe supplement support". Underline tabs Active/Ask vet about/Follow-ups w/ count badges.
Main col supplement cards (active = border-left 4px #15a06a; icon tile + title + status pill +
3-col detail grid Purpose/Evidence/Added + reminder toggle + notes + follow-up timeline). Right
rail 352px: Safety rules, Questions for your vet, Brain evidence stat tiles, Vet-safe summary CTA.
EMPTY: 0 counts, empty main col, keep static safety/questions cards.

## DASHBOARD (/dashboard)
H1 "{Dog}'s Health Brief" 30/700 + subtitle + "Share summary" btn. Main (elevated cards): Brain
Brief (eyebrow + memory chips + status word + headline + quick actions), "What Changed From Normal"
3 sparkline mini-charts (bars w8 r3, amber/green/blue per metric; gridlines), stable-signals row,
Follow-ups due card, Brain Story timeline. Right rail 340px: "What PawVital remembers" stat tiles,
"What to do next" checklist, Upcoming Reminders, Vet Summary CTA. EMPTY/new-user: neutral state,
em-dash charts, real low counts, labeled "after ~14 logs" preview; onboarding handles brand-new.
