import {
  createSession,
  addSymptoms,
  recordAnswer,
  calculateProbabilities,
  buildDiagnosisContext,
} from "./src/lib/triage-engine";

console.log("Starting Clinical Matrix Test...");

// Create a mock pet profile
const pet = {
  name: "Buddy",
  breed: "Labrador Retriever",
  age_years: 5,
  weight: 30,
};

// Create a new session
let session = createSession();

console.log("Initial candidate diseases:", session.candidate_diseases.length);

// Add a symptom
session = addSymptoms(session, ["limping"]);
console.log("Added symptom 'limping'");
console.log("Candidate diseases:", session.candidate_diseases.length);

// Record an answer
session = recordAnswer(session, "limping_onset", "sudden");
session = recordAnswer(session, "weight_bearing", "non_weight_bearing");

// Calculate probabilities
const probs = calculateProbabilities(session, pet);
console.log("\nTop 3 Diagnoses:");
for (let i = 0; i < Math.min(3, probs.length); i++) {
  const p = probs[i];
  console.log(`${i + 1}. ${p.name} (Score: ${p.final_score.toFixed(3)})`);
}

// Build final diagnosis context
const context = buildDiagnosisContext(session, pet);
console.log(`\nHighest Urgency: ${context.highest_urgency}`);
console.log("✅ Clinical Matrix logic executed successfully.");
