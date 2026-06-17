import urllib.request, json, urllib.parse, sys, time, textwrap
sys.stdout.reconfigure(encoding='utf-8')

PROJECT_REF = "aammaxdsjhezmbvdkqee"
API_URL = "https://pawvital-ai.vercel.app/api/ai/symptom-chat"
s = json.load(open("tmp/test_session.json"))
cookie_v = urllib.parse.quote(json.dumps([s["access_token"], s["refresh_token"]]))
HEADERS = {"Content-Type": "application/json", "Cookie": f"sb-{PROJECT_REF}-auth-token={cookie_v}"}

def base_sess():
    return {"known_symptoms":[],"answered_questions":[],"extracted_answers":{},
            "red_flags_triggered":[],"candidate_diseases":[],"body_systems_involved":[],"last_question_asked":None}

def call(pet, msgs, sess, retries=2):
    for attempt in range(retries+1):
        try:
            payload = json.dumps({"pet": pet, "messages": msgs, "session": sess}).encode()
            req = urllib.request.Request(API_URL, data=payload, headers=HEADERS, method="POST")
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 504 and attempt < retries:
                print(f"  [504 timeout, retry {attempt+2}]"); time.sleep(5); continue
            raise

def wrap(text, prefix="     ", width=78):
    lines = []
    for line in text.split("\n"):
        lines.append(textwrap.fill(line, width, initial_indent=prefix, subsequent_indent=prefix))
    return "\n".join(lines)

def run_scenario(name, pet, turns, clinician_notes):
    print(f"\n{'#'*72}")
    print(f"SCENARIO: {name}")
    print(f"Pet: {pet['name']} ({pet['breed']}, {pet['age_years']}yr, {pet['weight']})")
    print(f"{'#'*72}")

    msgs = []; sess = base_sess()
    findings = []

    for i, (umsg, expected_note) in enumerate(zip(turns, clinician_notes), 1):
        print(f"\n-- Turn {i} --")
        print(f"User: {umsg}")
        print(f"[Expected: {expected_note}]")
        msgs.append({"role": "user", "content": umsg})
        t0 = time.time()
        try:
            r = call(pet, msgs, sess)
        except Exception as e:
            print(f"ERROR: {e}"); break

        elapsed = time.time() - t0
        reply = r.get("reply") or r.get("message","(none)")
        rtype = r.get("type","chat")
        new_sess = r.get("session", sess)

        lazy = reply.lower().startswith(("got it","okay.","ok,","understood","noted.","sure.","alright."))
        opener_mark = "OPENER-FAIL" if lazy else "opener-ok"

        new_syms = sorted(set(new_sess.get("known_symptoms",[])) - set(sess.get("known_symptoms",[])))
        new_ans  = {k:v for k,v in new_sess.get("extracted_answers",{}).items()
                    if k not in sess.get("extracted_answers",{})}
        new_flags = sorted(set(new_sess.get("red_flags_triggered",[])) - set(sess.get("red_flags_triggered",[])))
        new_qa   = sorted(set(new_sess.get("answered_questions",[])) - set(sess.get("answered_questions",[])))
        next_q   = new_sess.get("last_question_asked")

        print(f"AI [{rtype}] {elapsed:.1f}s  {opener_mark}")
        print(wrap(reply, "  | "))

        if new_syms:  print(f"  +Sx:    {new_syms}")
        if new_ans:   print(f"  +Ans:   {dict(list(new_ans.items())[:6])}")
        if new_qa:    print(f"  +Done:  {new_qa}")
        if new_flags: print(f"  !! RED FLAGS: {new_flags}")
        if next_q:    print(f"  NextQ:  {next_q}")

        issue = None
        if lazy:
            issue = f"OPENER not stripped"
        elif rtype == "question" and next_q and next_q == sess.get("last_question_asked"):
            issue = f"REPEAT QUESTION: {next_q} asked again without progress"

        if issue:
            findings.append(f"T{i} [{name}]: {issue}")
            print(f"  ** ISSUE: {issue}")

        if r.get("report") or rtype == "emergency":
            rpt = r.get("report", {})
            urgency = rpt.get("urgency_level","?")
            print(f"\n  ===== FINAL CONCLUSION {'EMERGENCY ' if rtype=='emergency' else ''} =====")
            print(f"  Urgency: {urgency}")
            if rpt.get("summary"):
                print(wrap(rpt.get("summary",""), "  SUM: "))
            if rpt.get("recommendation"):
                print(wrap(rpt.get("recommendation",""), "  REC: "))
            if rpt.get("top_diagnoses"):
                for d in rpt["top_diagnoses"][:3]:
                    print(f"  Dx: {d.get('name','')} (conf={d.get('confidence','?')})")
            print(f"  Flags: {new_sess.get('red_flags_triggered',[])}")

        msgs.append({"role": "assistant", "content": reply})
        sess = new_sess

        if rtype in ("emergency","report","cannot_assess"):
            if rtype == "cannot_assess":
                findings.append(f"T{i} [{name}]: CANNOT_ASSESS triggered — check if premature")
                print(f"  ** ISSUE: cannot_assess — is this premature?")
            break

    return findings

# SCENARIO 1: Ear infection — non-emergency, gradual, should reach report
pet1 = {"id":"s1","name":"Buddy","species":"dog","breed":"Cocker Spaniel","age_years":6,"weight":"25lbs","weight_lbs":25}
turns1 = [
    "Buddy keeps shaking his head and scratching at his left ear constantly",
    "Its been going on for about 3 days now",
    "Theres a brownish-yellow discharge and it smells really bad",
    "He doesnt seem to be in pain when I touch it, no yelping",
    "He hasnt had ear problems before but he swims a lot",
]
notes1 = [
    "should detect ear_scratching+head_shaking, ask clarifying Q",
    "should extract scratch_duration: 3 days",
    "should detect ear_discharge + ear_odor - otitis candidate",
    "should extract ear_pain: false - important differentiator",
    "swim history = relevant context for otitis externa",
]

# SCENARIO 2: Chocolate ingestion — time-sensitive toxin
pet2 = {"id":"s2","name":"Daisy","species":"dog","breed":"Beagle","age_years":2,"weight":"20lbs","weight_lbs":20}
turns2 = [
    "I think Daisy ate some chocolate off the counter about an hour ago",
    "It was dark chocolate, like baking chocolate, maybe a few squares",
    "She seems fine right now, nothing happening yet",
    "She weighs about 20 pounds",
    "Shes a little restless but thats kind of normal for her",
]
notes2 = [
    "must detect toxin ingestion - chocolate is time-critical",
    "dark/baking chocolate = high theobromine - should escalate urgency",
    "no symptoms yet but chocolate toxicity can take 6-12h to appear",
    "weight critical for dose calculation",
    "restlessness could be early toxicosis - should not dismiss",
]

# SCENARIO 3: Male cat urinary blockage — CRITICAL emergency
pet3 = {"id":"s3","name":"Whiskers","species":"cat","breed":"Domestic Shorthair","age_years":4,"weight":"10lbs","weight_lbs":10}
turns3 = [
    "Whiskers has been going to the litter box over and over but barely any urine comes out",
    "This started last night, so maybe 12 hours ago",
    "Hes male and indoor only",
    "He looks uncomfortable and cries a little when he tries to go",
    "Should I be worried? Its Sunday and the vet is closed",
]
notes3 = [
    "male cat straining = URETHRAL OBSTRUCTION until proven otherwise",
    "12+ hours straining = severe - must escalate",
    "male cat + straining = classic obstruction presentation",
    "pain/crying = moderate-severe distress",
    "MUST advise emergency vet NOW - blocked cat = life-threatening",
]

all_findings = []
all_findings += run_scenario("Ear Infection (Buddy/Cocker Spaniel)", pet1, turns1, notes1)
all_findings += run_scenario("Chocolate Ingestion (Daisy/Beagle)", pet2, turns2, notes2)
all_findings += run_scenario("Cat Urinary Blockage (Whiskers/Male Cat)", pet3, turns3, notes3)

print(f"\n{'='*72}")
print("PRESSURE TEST FINDINGS")
print(f"{'='*72}")
if all_findings:
    for f in all_findings:
        print(f"  ** {f}")
else:
    print("  No structural issues detected.")
