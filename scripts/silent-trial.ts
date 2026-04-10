/**
 * PawVital Silent Trial Framework (VET-911)
 *
 * Runs real conversations through the benchmark scoring system in shadow mode.
 * Captures triage engine output without affecting user experience.
 *
 * Usage:
 *   npx ts-node --esm scripts/silent-trial.ts              # Run on recent conversations
 *   npx ts-node --esm scripts/silent-trial.ts --days=7     # Last 7 days
 *   npx ts-node --esm scripts/silent-trial.ts --report     # Generate report from stored results
 *
 * Architecture:
 *   1. Fetch recent symptom-chat conversations from logs
 *   2. Reconstruct case-like structure from conversation
 *   3. Score against deterministic triage engine
 *   4. Flag discrepancies for review
 *   5. Aggregate trends over time
 */

import * as fs from 'fs';
import * as path from 'path';

// === TYPE DEFINITIONS ===

interface ShadowCase {
  conversation_id: string;
  timestamp: string;
  owner_input: string;
  normalized_complaints: string[];
  pet_profile: {
    species: string;
    breed: string | null;
    age_years: number | null;
    sex: string | null;
    neutered: boolean | null;
    weight_kg: number | null;
  };
  questions_asked: string[];
  answers_given: Record<string, string>;
  final_disposition: string;
  red_flags_detected: string[];
  urgency_tier_assigned: number;
  response_time_ms: number;
}

interface ShadowResult {
  conversation_id: string;
  timestamp: string;
  matched_benchmark_case: string | null;
  benchmark_similarity: number;
  expected_disposition: string | null;
  actual_disposition: string;
  disposition_safe: boolean;
  red_flags_expected: string[];
  red_flags_detected: string[];
  red_flags_missed: string[];
  questions_coverage: number;
  escalation_appropriate: boolean;
  flag_for_review: boolean;
  review_reason: string | null;
}

interface ShadowReport {
  run_id: string;
  timestamp: string;
  period_start: string;
  period_end: string;
  total_conversations: number;
  analyzable_conversations: number;
  matched_to_benchmark: number;
  results: ShadowResult[];
  summary: {
    disposition_safety_rate: number;
    red_flag_detection_rate: number;
    question_coverage_avg: number;
    escalation_appropriateness_rate: number;
    flag_for_review_rate: number;
  };
  trends: {
    date: string;
    conversations: number;
    safety_rate: number;
    flag_rate: number;
  }[];
  top_failure_modes: Array<{
    mode: string;
    count: number;
    examples: string[];
  }>;
}

interface ConversationMessage {
  role: string;
  content?: string;
  type?: string;
  question_id?: string;
  answer_to?: string;
  disposition?: string;
}

interface ConversationLogEntry {
  conversation_id: string;
  timestamp: string;
  messages?: ConversationMessage[];
  metadata?: {
    pet_profile?: ShadowCase['pet_profile'];
    normalized_complaints?: string[];
    disposition?: string;
    red_flags_detected?: string[];
    urgency_tier?: number;
    response_time_ms?: number;
  };
}

interface BenchmarkShadowCase {
  case_id: string;
  owner_input: string;
  normalized_complaints: string[];
  pet_profile: ShadowCase['pet_profile'];
  category: {
    complaint_families: string[];
    urgency_tier: number;
  };
  adjudication: {
    disposition: string;
    red_flags_present: string[];
    must_ask_questions: string[];
  };
}

// === CONVERSATION RECONSTRUCTION ===

/**
 * Reconstructs a case-like structure from a symptom-chat conversation.
 *
 * In production, this would parse the conversation log to extract:
 * - Owner's initial complaint
 * - Normalized symptoms
 * - Pet profile information
 * - Questions asked and answers
 * - Final disposition
 */
function reconstructFromConversation(logEntry: ConversationLogEntry): ShadowCase | null {
  try {
    const { conversation_id, timestamp, messages, metadata } = logEntry;

    if (!messages || messages.length === 0) return null;

    // Extract owner input (first message)
    const ownerMessage = messages.find((m) => m.role === 'user');
    if (!ownerMessage) return null;

    // Extract pet profile from session or messages
    const petProfile = metadata?.pet_profile || {
      species: 'dog',
      breed: null,
      age_years: null,
      sex: null,
      neutered: null,
      weight_kg: null,
    };

    // Extract normalized complaints from symptom extraction
    const normalizedComplaints = metadata?.normalized_complaints || [];

    // Extract questions asked
    const questionsAsked = messages
      .filter((m) => m.role === 'assistant' && m.type === 'question')
      .map((m) => m.question_id || m.content || '');

    // Extract answers
    const answersGiven: Record<string, string> = {};
    messages
      .filter((m): m is ConversationMessage & { answer_to: string } => m.role === 'user' && Boolean(m.answer_to))
      .forEach((m) => {
        answersGiven[m.answer_to] = m.content || '';
      });

    // Extract final disposition
    const finalMessage = messages.findLast((m) => m.role === 'assistant' && m.type === 'disposition');
    const finalDisposition = finalMessage?.disposition || metadata?.disposition || 'monitor_and_reassess';

    // Extract red flags
    const redFlagsDetected = metadata?.red_flags_detected || [];
    const urgencyTier = metadata?.urgency_tier || 4;

    // Extract response time
    const responseTime = metadata?.response_time_ms || 0;

    return {
      conversation_id,
      timestamp,
      owner_input: ownerMessage.content || '',
      normalized_complaints: normalizedComplaints,
      pet_profile: petProfile,
      questions_asked: questionsAsked,
      answers_given: answersGiven,
      final_disposition: finalDisposition,
      red_flags_detected: redFlagsDetected,
      urgency_tier_assigned: urgencyTier,
      response_time_ms: responseTime,
    };
  } catch {
    return null;
  }
}

// === BENCHMARK MATCHING ===

/**
 * Finds the most similar benchmark case to a real conversation.
 * Uses complaint family overlap, pet profile similarity, and disposition.
 */
function findSimilarBenchmarkCase(
  shadowCase: ShadowCase,
  benchmarks: BenchmarkShadowCase[]
): { case_id: string; similarity: number } | null {
  if (benchmarks.length === 0) return null;

  let bestMatch: { case_id: string; similarity: number } | null = null;
  let bestScore = 0;

  for (const bench of benchmarks) {
    let score = 0;

    // Complaint family overlap (highest weight)
    const shadowFamilies = new Set(shadowCase.normalized_complaints);
    const benchFamilies = new Set(bench.category.complaint_families);
    const overlap = [...shadowFamilies].filter(f => benchFamilies.has(f)).length;
    const union = new Set([...shadowFamilies, ...benchFamilies]).size;
    const jaccard = union > 0 ? overlap / union : 0;
    score += jaccard * 0.5;

    // Same disposition
    if (shadowCase.final_disposition === bench.adjudication.disposition) {
      score += 0.2;
    }

    // Same urgency tier
    if (shadowCase.urgency_tier_assigned === bench.category.urgency_tier) {
      score += 0.15;
    }

    // Breed match (if both have breeds)
    if (shadowCase.pet_profile.breed && bench.pet_profile.breed === shadowCase.pet_profile.breed) {
      score += 0.1;
    }

    // Age proximity
    if (shadowCase.pet_profile.age_years && bench.pet_profile.age_years) {
      const ageDiff = Math.abs(shadowCase.pet_profile.age_years - bench.pet_profile.age_years);
      score += Math.max(0, 0.05 - ageDiff * 0.01);
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = { case_id: bench.case_id, similarity: score };
    }
  }

  // Only return if similarity is above threshold
  if (bestMatch && bestMatch.similarity >= 0.3) {
    return bestMatch;
  }

  return null;
}

// === SHADOW SCORING ===

function scoreShadowCase(
  shadowCase: ShadowCase,
  match: { case_id: string; similarity: number } | null,
  benchmark: BenchmarkShadowCase | null
): ShadowResult {
  let reviewReason: string | null = null;
  let dispositionSafe = true;
  let escalationAppropriate = true;
  let redFlagsMissed: string[] = [];
  let questionsCoverage = 1;

  if (match && benchmark) {
    const expected = benchmark.adjudication;

    // Check disposition safety
    const dispositionUrgency: Record<string, number> = {
      'emergency_vet_now': 1,
      'same_day_vet': 2,
      'vet_within_48h': 3,
      'monitor_and_reassess': 4,
      'cannot_safely_assess': 5,
    };

    const expectedUrgency = dispositionUrgency[expected.disposition] || 4;
    const actualUrgency = dispositionUrgency[shadowCase.final_disposition] || 4;

    // Unsafe if actual is significantly less urgent than expected
    dispositionSafe = actualUrgency <= expectedUrgency + 1;

    // Escalation appropriate if within 1 tier
    escalationAppropriate = Math.abs(actualUrgency - expectedUrgency) <= 1;

    // Red flag coverage
    const detectedSet = new Set<string>(shadowCase.red_flags_detected);
    redFlagsMissed = expected.red_flags_present.filter((f: string) => !detectedSet.has(f));

    // Question coverage
    const mustAskSet = new Set<string>(expected.must_ask_questions);
    const askedSet = new Set<string>(shadowCase.questions_asked);
    const mustAskAnswered = [...mustAskSet].filter(q => askedSet.has(q)).length;
    questionsCoverage = mustAskSet.size > 0 ? mustAskAnswered / mustAskSet.size : 1;

    // Flag for review if:
    if (!dispositionSafe) {
      reviewReason = 'Unsafe disposition vs benchmark';
    } else if (redFlagsMissed.length > 0) {
      reviewReason = `Missed ${redFlagsMissed.length} red flag(s): ${redFlagsMissed.join(', ')}`;
    } else if (questionsCoverage < 0.5) {
      reviewReason = `Low question coverage: ${(questionsCoverage * 100).toFixed(0)}%`;
    }
  } else {
    // No benchmark match — flag if emergency disposition not given for tier 1
    if (shadowCase.urgency_tier_assigned === 1 && shadowCase.final_disposition !== 'emergency_vet_now') {
      reviewReason = 'Tier 1 case without emergency disposition (no benchmark match)';
    }
  }

  return {
    conversation_id: shadowCase.conversation_id,
    timestamp: shadowCase.timestamp,
    matched_benchmark_case: match?.case_id || null,
    benchmark_similarity: match?.similarity || 0,
    expected_disposition: benchmark?.adjudication?.disposition || null,
    actual_disposition: shadowCase.final_disposition,
    disposition_safe: dispositionSafe,
    red_flags_expected: benchmark?.adjudication?.red_flags_present || [],
    red_flags_detected: shadowCase.red_flags_detected,
    red_flags_missed: redFlagsMissed,
    questions_coverage: questionsCoverage,
    escalation_appropriate: escalationAppropriate,
    flag_for_review: reviewReason !== null,
    review_reason: reviewReason,
  };
}

// === REPORT GENERATION ===

function generateShadowReport(
  shadowCases: ShadowCase[],
  benchmarks: BenchmarkShadowCase[],
  days: number
): ShadowReport {
  const results: ShadowResult[] = [];

  for (const sc of shadowCases) {
    const match = findSimilarBenchmarkCase(sc, benchmarks);
    const benchmark = match ? benchmarks.find(b => b.case_id === match.case_id) || null : null;
    const result = scoreShadowCase(sc, match, benchmark);
    results.push(result);
  }

  // Summary metrics
  const analyzable = results.filter(r => r.matched_benchmark_case !== null);
  const dispositionSafetyRate = analyzable.length > 0
    ? analyzable.filter(r => r.disposition_safe).length / analyzable.length
    : 1;

  const withRedFlags = analyzable.filter(r => r.red_flags_expected.length > 0);
  const redFlagDetectionRate = withRedFlags.length > 0
    ? withRedFlags.filter(r => r.red_flags_missed.length === 0).length / withRedFlags.length
    : 1;

  const questionCoverageAvg = analyzable.length > 0
    ? analyzable.reduce((sum, r) => sum + r.questions_coverage, 0) / analyzable.length
    : 1;

  const escalationAppropriatenessRate = analyzable.length > 0
    ? analyzable.filter(r => r.escalation_appropriate).length / analyzable.length
    : 1;

  const flagForReviewRate = results.length > 0
    ? results.filter(r => r.flag_for_review).length / results.length
    : 0;

  // Trends by date
  const dateGroups: Record<string, ShadowResult[]> = {};
  for (const r of results) {
    const date = r.timestamp.split('T')[0];
    if (!dateGroups[date]) dateGroups[date] = [];
    dateGroups[date].push(r);
  }

  const trends = Object.entries(dateGroups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group]) => ({
      date,
      conversations: group.length,
      safety_rate: group.filter(r => r.disposition_safe).length / group.length,
      flag_rate: group.filter(r => r.flag_for_review).length / group.length,
    }));

  // Top failure modes
  const failureModes: Record<string, { count: number; examples: string[] }> = {};
  for (const r of results.filter(r => r.flag_for_review)) {
    const reason = r.review_reason || 'unknown';
    const mode = reason.split(':')[0]; // Group by first part
    if (!failureModes[mode]) {
      failureModes[mode] = { count: 0, examples: [] };
    }
    failureModes[mode].count++;
    if (failureModes[mode].examples.length < 3) {
      failureModes[mode].examples.push(r.conversation_id);
    }
  }

  const topFailureModes = Object.entries(failureModes)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)
    .map(([mode, data]) => ({
      mode,
      count: data.count,
      examples: data.examples,
    }));

  const now = new Date();
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  return {
    run_id: `SHADOW-${now.toISOString().split('T')[0]}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
    timestamp: now.toISOString(),
    period_start: periodStart,
    period_end: now.toISOString(),
    total_conversations: shadowCases.length,
    analyzable_conversations: analyzable.length,
    matched_to_benchmark: results.filter(r => r.matched_benchmark_case !== null).length,
    results,
    summary: {
      disposition_safety_rate: parseFloat(dispositionSafetyRate.toFixed(3)),
      red_flag_detection_rate: parseFloat(redFlagDetectionRate.toFixed(3)),
      question_coverage_avg: parseFloat(questionCoverageAvg.toFixed(3)),
      escalation_appropriateness_rate: parseFloat(escalationAppropriatenessRate.toFixed(3)),
      flag_for_review_rate: parseFloat(flagForReviewRate.toFixed(3)),
    },
    trends,
    top_failure_modes: topFailureModes,
  };
}

// === MAIN ===

function main() {
  const args = process.argv.slice(2);
  let days = 7;
  let reportOnly = false;

  for (const arg of args) {
    if (arg.startsWith('--days=')) {
      days = parseInt(arg.split('=')[1]);
    } else if (arg === '--report') {
      reportOnly = true;
    }
  }

  if (reportOnly) {
    console.log('Report-only mode requested; using available local logs or simulated data.');
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`PAWVITAL SILENT TRIAL FRAMEWORK`);
  console.log(`${'='.repeat(60)}`);

  // Load benchmarks
  const benchmarkPath = path.join(process.cwd(), 'data', 'benchmark', 'gold-benchmark-v1.jsonl');
  if (!fs.existsSync(benchmarkPath)) {
    console.error(`Benchmark file not found: ${benchmarkPath}`);
    console.error('Run `npx ts-node --esm scripts/generate-benchmark-cases.ts` first.');
    process.exit(1);
  }

  const benchLines = fs.readFileSync(benchmarkPath, 'utf-8').trim().split('\n');
  const benchmarks = benchLines.map(l => JSON.parse(l) as BenchmarkShadowCase);
  console.log(`Loaded ${benchmarks.length} benchmark cases`);

  // Load conversation logs
  const logDir = path.join(process.cwd(), 'logs');
  const logFiles = fs.existsSync(logDir)
    ? fs.readdirSync(logDir).filter(f => f.endsWith('.jsonl') || f.endsWith('.json'))
    : [];

  if (logFiles.length === 0) {
    console.log('\nNo conversation logs found. Creating simulated shadow run...');

    // Generate simulated shadow cases for demonstration
    const shadowCases: ShadowCase[] = [];
    for (let i = 0; i < 50; i++) {
      const bench = benchmarks[i % benchmarks.length];
      shadowCases.push({
        conversation_id: `CONV-${String(i + 1).padStart(4, '0')}`,
        timestamp: new Date(Date.now() - Math.random() * days * 24 * 60 * 60 * 1000).toISOString(),
        owner_input: bench.owner_input,
        normalized_complaints: bench.normalized_complaints,
        pet_profile: {
          species: 'dog',
          breed: bench.pet_profile.breed,
          age_years: bench.pet_profile.age_years,
          sex: bench.pet_profile.sex,
          neutered: bench.pet_profile.neutered,
          weight_kg: bench.pet_profile.weight_kg,
        },
        questions_asked: bench.adjudication.must_ask_questions.slice(0, 3),
        answers_given: {},
        final_disposition: bench.adjudication.disposition,
        red_flags_detected: bench.adjudication.red_flags_present.slice(0, -1), // Simulate missing 1
        urgency_tier_assigned: bench.category.urgency_tier,
        response_time_ms: Math.floor(Math.random() * 2000 + 500),
      });
    }

    const report = generateShadowReport(shadowCases, benchmarks, days);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`SHADOW TRIAL REPORT: ${report.run_id}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Period: ${report.period_start.split('T')[0]} to ${report.period_end.split('T')[0]}`);
    console.log(`Total conversations: ${report.total_conversations}`);
    console.log(`Analyzable: ${report.analyzable_conversations}`);
    console.log(`Matched to benchmark: ${report.matched_to_benchmark}`);

    console.log(`\nSUMMARY:`);
    console.log(`  Disposition Safety Rate:       ${(report.summary.disposition_safety_rate * 100).toFixed(1)}%`);
    console.log(`  Red Flag Detection Rate:       ${(report.summary.red_flag_detection_rate * 100).toFixed(1)}%`);
    console.log(`  Question Coverage (avg):       ${(report.summary.question_coverage_avg * 100).toFixed(1)}%`);
    console.log(`  Escalation Appropriateness:    ${(report.summary.escalation_appropriateness_rate * 100).toFixed(1)}%`);
    console.log(`  Flagged for Review:            ${(report.summary.flag_for_review_rate * 100).toFixed(1)}%`);

    if (report.top_failure_modes.length > 0) {
      console.log(`\nTOP FAILURE MODES:`);
      for (const fm of report.top_failure_modes) {
        console.log(`  ${fm.mode}: ${fm.count} occurrences`);
        console.log(`    Examples: ${fm.examples.join(', ')}`);
      }
    }

    if (report.trends.length > 0) {
      console.log(`\nTRENDS:`);
      for (const t of report.trends.slice(-7)) {
        console.log(`  ${t.date}: ${t.conversations} conv, safety ${(t.safety_rate * 100).toFixed(0)}%, flags ${(t.flag_rate * 100).toFixed(0)}%`);
      }
    }

    // Write report
    const outputDir = path.join(process.cwd(), 'data', 'benchmark');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const reportPath = path.join(outputDir, `shadow-${report.run_id}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport written to: ${reportPath}`);

  } else {
    console.log(`Found ${logFiles.length} log files`);
    // TODO: Implement real log parsing when log format is finalized
    console.log('Real log parsing not yet implemented. Run with no logs for simulated mode.');
  }
}

main();
