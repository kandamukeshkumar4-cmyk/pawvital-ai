const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_BUCKETS = [
  "complaint_normalization_miss",
  "deterministic_emergency_composite_not_triggered",
  "question_orchestration_overrode_emergency",
  "report_readiness_contract_mismatch",
  "harness_route_contract_mismatch",
  "missing_red_flag_linkage",
  "missing_owner_language_mapping",
];

const SEVERITY_ORDER = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const CASE_BUCKET_OVERRIDES = {
  "cardiac-emergency-collapse-after-excitement": {
    bucket: "missing_red_flag_linkage",
    reason:
      "Collapse after excitement should short-circuit through the collapse red-flag path before question orchestration continues.",
  },
  "cardiac-emergency-collapse-blue-gums": {
    bucket: "missing_red_flag_linkage",
    reason:
      "Blue or gray gums plus collapse are direct emergency cues and should never stay in question flow.",
  },
  "cardiac-emergency-rapid-breathing-pale": {
    bucket: "deterministic_emergency_composite_not_triggered",
    reason:
      "Rapid breathing plus pallor and weakness matches a shock-style emergency composite that did not trigger.",
  },
  "cardiac-emergency-resting-breathing-distress": {
    bucket: "missing_red_flag_linkage",
    reason:
      "Resting respiratory distress in a cardiac presentation should link directly to a respiratory emergency outcome.",
  },
  "emergency-acute-paralysis": {
    bucket: "missing_red_flag_linkage",
    reason:
      "Sudden hind-limb paralysis is a neurologic red flag that still fell through to a question response.",
  },
  "emergency-addisonian-crisis": {
    bucket: "deterministic_emergency_composite_not_triggered",
    reason:
      "Intermittent vomiting plus collapse should match an Addisonian-crisis emergency composite.",
  },
  "emergency-allergic-reaction-hives": {
    bucket: "missing_owner_language_mapping",
    reason:
      "Owner wording around hives and a puffing face was routed like an itching complaint instead of a severe-allergy emergency.",
  },
  "emergency-anaphylaxis": {
    bucket: "deterministic_emergency_composite_not_triggered",
    reason:
      "Facial swelling plus breathing trouble should trigger the anaphylaxis composite immediately.",
  },
};

const MESSAGE_HINTS = {
  difficulty_breathing: [/breath/i, /pant/i, /air/i, /cyan/i],
  seizure_collapse: [/collapse/i, /collapsed/i, /seizure/i, /out of it/i],
  lethargy: [/weak/i, /barely stand/i, /out of it/i, /tired/i],
  swollen_abdomen: [/belly/i, /abdomen/i, /bloated/i, /huge/i, /tight/i],
  excessive_scratching: [/hives/i, /itch/i, /scratch/i, /puffing up/i],
  trauma: [/dragging/i, /hit by car/i, /fracture/i, /wound/i, /injur/i],
  limping: [/limp/i, /can't use/i, /dragging/i],
  vomiting: [/vomit/i, /retch/i, /thrown up/i],
  pregnancy_birth: [/labor/i, /puppy/i, /pregnan/i, /discharge/i],
  urination_problem: [/urine/i, /pee/i, /squat/i, /straining/i],
  trembling: [/trembl/i, /shak/i],
  wound_skin_issue: [/wound/i, /bleed/i, /bite/i, /burn/i],
  post_vaccination_reaction: [/vaccine/i, /shot/i],
  diarrhea: [/diarrhea/i, /stool/i],
  coughing_breathing_combined: [/cough/i, /breath/i],
};

const COMPOSITE_PATTERNS = [
  {
    label: "respiratory shock",
    tests: [/breathing fast|breathing hard|struggling to breathe/i, /pale|pallor|blue|gray gum/i],
  },
  {
    label: "addisonian crisis",
    tests: [/vomit|vomiting/i, /collapse|collapsed/i],
  },
  {
    label: "gdv",
    tests: [/belly|abdomen|bloated|huge|tight/i, /trying to vomit|nothing comes out|retch/i],
  },
  {
    label: "anaphylaxis",
    tests: [/face swelled|facial swelling|puffing up|hives/i, /breathing hard|breathing trouble|struggling to breathe/i],
  },
  {
    label: "allergic facial swelling",
    tests: [/hives/i, /face swelled|facial swelling|puffing up/i],
  },
  {
    label: "dystocia",
    tests: [/green discharge|straining/i, /no puppy|not delivered|labor/i],
  },
  {
    label: "urinary blockage",
    tests: [/straining|squatting/i, /no urine|almost no urine/i],
  },
];

const RED_FLAG_PATTERNS = [
  /blue-gray|blue gum|gray gum|cyan/i,
  /collapse|collapsed/i,
  /pale/i,
  /breathing hard even while lying still|resting respiratory distress|struggling to breathe/i,
  /can't use .*back legs|dragging himself|dragging herself|paralysis/i,
  /face swelled|facial swelling|puffing up/i,
  /hives/i,
  /seizure/i,
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function toRepoRelative(filePath, rootDir) {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

function loadSuiteCases(rootDir, suitePath) {
  const fullPath = path.resolve(rootDir, suitePath);
  const stat = fs.statSync(fullPath);
  if (!stat.isDirectory()) {
    const suite = readJson(fullPath);
    return (suite.cases || []).map((row) => ({ ...row, sourceFile: toRepoRelative(fullPath, rootDir) }));
  }

  const files = fs
    .readdirSync(fullPath)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".schema.json"))
    .sort();
  return files.flatMap((name) => {
    const filePath = path.join(fullPath, name);
    const suite = readJson(filePath);
    return (suite.cases || []).map((row) => ({
      ...row,
      sourceFile: toRepoRelative(filePath, rootDir),
    }));
  });
}

function parseFailedChecks(description) {
  const prefix = "Failed checks:";
  const index = String(description || "").indexOf(prefix);
  if (index < 0) {
    return [];
  }
  return String(description)
    .slice(index + prefix.length)
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function extractMissedSymptoms(failedChecks) {
  return failedChecks
    .filter((check) => check.startsWith("knownSymptomsInclude:"))
    .map((check) => check.split(":")[1])
    .filter(Boolean);
}

function pickPrimaryComplaintFamily(complaintFamilies, message, failedChecks) {
  const missedSymptoms = extractMissedSymptoms(failedChecks);
  if (missedSymptoms.length > 0) {
    return missedSymptoms[0];
  }
  if (!Array.isArray(complaintFamilies) || complaintFamilies.length === 0) {
    return "unclassified";
  }

  const scored = complaintFamilies.map((family) => {
    const hints = MESSAGE_HINTS[family] || [];
    const score = hints.reduce(
      (total, pattern) => total + (pattern.test(message) ? 1 : 0),
      0
    );
    return { family, score };
  });
  scored.sort((left, right) => right.score - left.score);
  return scored[0].family;
}

function collectSignalText(record) {
  return [
    record.caseId,
    record.description,
    record.message,
    ...(record.tags || []),
    ...(record.complaintFamilies || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchPatternLabels(patterns, signalText) {
  return patterns
    .filter((pattern) =>
      Array.isArray(pattern.tests)
        ? pattern.tests.every((test) => test.test(signalText))
        : pattern.test(signalText)
    )
    .map((pattern) => pattern.label || pattern.source);
}

function hasRouteContractMismatch(record) {
  return (
    record.failureCategories.includes("route_error") ||
    !record.actualResponseType ||
    record.actualResponseType === "missing"
  );
}

function hasReadyOnlyMismatch(record) {
  return (
    record.failedChecks.includes("readyForReport") &&
    !record.failedChecks.includes("responseType")
  );
}

function classifyRecord(record) {
  const override = CASE_BUCKET_OVERRIDES[record.caseId];
  if (override) {
    return override;
  }
  if (hasRouteContractMismatch(record)) {
    return {
      bucket: "harness_route_contract_mismatch",
      reason: `Route or harness contract mismatch observed: ${record.failureDescriptions[0]}.`,
    };
  }
  if (hasReadyOnlyMismatch(record)) {
    return {
      bucket: "report_readiness_contract_mismatch",
      reason:
        "The response type matched the clinical intent, but the ready-for-report contract still failed.",
    };
  }

  const signalText = collectSignalText(record);
  const failedSymptoms = extractMissedSymptoms(record.failedChecks);
  const ownerLanguage =
    /low-literacy|slang|vague|the runs|throwing up bricks|puffing up/i.test(signalText);
  if (ownerLanguage) {
    return {
      bucket: "missing_owner_language_mapping",
      reason:
        "Owner-language phrasing did not normalize into the intended emergency signal set.",
    };
  }
  if (failedSymptoms.length > 0) {
    return {
      bucket: "complaint_normalization_miss",
      reason: `Known symptom extraction missed ${failedSymptoms.join(", ")} before emergency escalation.`,
    };
  }

  const compositeMatches = matchPatternLabels(COMPOSITE_PATTERNS, signalText);
  if (compositeMatches.length > 0) {
    return {
      bucket: "deterministic_emergency_composite_not_triggered",
      reason: `Composite emergency pattern detected (${compositeMatches.join(", ")}) but the route still returned ${record.actualResponseType}.`,
    };
  }

  const redFlagMatches = matchPatternLabels(
    RED_FLAG_PATTERNS.map((pattern) => ({ tests: [pattern], label: pattern.source })),
    signalText
  );
  if (redFlagMatches.length > 0) {
    return {
      bucket: "missing_red_flag_linkage",
      reason:
        "Direct red-flag owner language was present, but the deterministic emergency linkage did not fire.",
    };
  }

  if (record.expectedResponseType === "emergency" && record.actualResponseType === "question") {
    return {
      bucket: "question_orchestration_overrode_emergency",
      reason:
        "The route stayed on question orchestration even after landing in an emergency-only benchmark case.",
    };
  }

  if (record.failedChecks.includes("readyForReport")) {
    return {
      bucket: "report_readiness_contract_mismatch",
      reason: "Ready-for-report contract did not match the expected emergency terminal state.",
    };
  }

  return {
    bucket: "harness_route_contract_mismatch",
    reason: `Unclassified failure shape: ${record.failureDescriptions[0]}.`,
  };
}

function buildSuiteCaseMap(suiteCases) {
  const map = new Map();
  for (const row of suiteCases) {
    const existing = map.get(row.id);
    if (!existing) {
      map.set(row.id, {
        row,
        sourceFiles: new Set([row.sourceFile]),
      });
      continue;
    }
    existing.sourceFiles.add(row.sourceFile);
  }
  return map;
}

function buildCaseLedgerEntries(scorecard, suiteCaseMap) {
  const relevantFailures = (scorecard.failures || []).filter(
    (failure) => failure.expected === "emergency"
  );
  const byCase = new Map();

  for (const failure of relevantFailures) {
    const suiteEntry = suiteCaseMap.get(failure.caseId);
    const suiteCase = suiteEntry?.row || {};
    const failedChecks = parseFailedChecks(failure.description);
    const message = suiteCase.request?.messages?.[0]?.content || "";
    const complaintFamilies = Array.isArray(suiteCase.complaint_family_tags)
      ? suiteCase.complaint_family_tags
      : [];

    if (!byCase.has(failure.caseId)) {
      byCase.set(failure.caseId, {
        caseId: failure.caseId,
        description: suiteCase.description || failure.caseId,
        message,
        riskTier: suiteCase.risk_tier || "tier_1_emergency",
        expectedResponseType: failure.expected,
        actualResponseType: failure.actual,
        safetySeverity: failure.severity,
        tags: Array.isArray(suiteCase.tags) ? suiteCase.tags : [],
        complaintFamilies,
        primaryComplaintFamily: pickPrimaryComplaintFamily(
          complaintFamilies,
          message,
          failedChecks
        ),
        failureCategories: new Set(),
        failureDescriptions: new Set(),
        failedChecks: new Set(),
        failureOccurrenceCount: 0,
        sourceFiles: suiteEntry ? [...suiteEntry.sourceFiles] : [],
      });
    }

    const record = byCase.get(failure.caseId);
    record.failureOccurrenceCount += 1;
    record.failureCategories.add(failure.category);
    record.failureDescriptions.add(failure.description);
    for (const check of failedChecks) {
      record.failedChecks.add(check);
    }
  }

  return [...byCase.values()].map((record) => {
    const normalized = {
      ...record,
      failureCategories: [...record.failureCategories].sort(),
      failureDescriptions: [...record.failureDescriptions].sort(),
      failedChecks: [...record.failedChecks].sort(),
    };
    const classification = classifyRecord(normalized);
    return {
      ...normalized,
      rootCauseBucket: classification.bucket,
      rootCauseReason: classification.reason,
      sortSeverityRank: SEVERITY_ORDER[normalized.safetySeverity] ?? 99,
    };
  });
}

function buildBucketSummary(caseLedger) {
  const summary = new Map(
    REQUIRED_BUCKETS.map((bucket) => [
      bucket,
      {
        rootCauseBucket: bucket,
        safetySeverity: "CRITICAL",
        uniqueCaseCount: 0,
        failureOccurrenceCount: 0,
        complaintFamilies: new Set(),
        caseIds: [],
      },
    ])
  );

  for (const record of caseLedger) {
    const current = summary.get(record.rootCauseBucket);
    current.uniqueCaseCount += 1;
    current.failureOccurrenceCount += record.failureOccurrenceCount;
    current.caseIds.push(record.caseId);
    current.complaintFamilies.add(record.primaryComplaintFamily);
  }

  return [...summary.values()]
    .map((entry) => ({
      ...entry,
      complaintFamilies: [...entry.complaintFamilies].sort(),
    }))
    .sort((left, right) => {
      const severityDelta =
        (SEVERITY_ORDER[left.safetySeverity] ?? 99) -
        (SEVERITY_ORDER[right.safetySeverity] ?? 99);
      if (severityDelta !== 0) return severityDelta;
      if (right.uniqueCaseCount !== left.uniqueCaseCount) {
        return right.uniqueCaseCount - left.uniqueCaseCount;
      }
      if (right.failureOccurrenceCount !== left.failureOccurrenceCount) {
        return right.failureOccurrenceCount - left.failureOccurrenceCount;
      }
      return left.rootCauseBucket.localeCompare(right.rootCauseBucket);
    });
}

function buildResidualBlockers(caseLedger) {
  const groups = new Map();
  for (const record of caseLedger) {
    const key = [
      record.safetySeverity,
      record.rootCauseBucket,
      record.riskTier,
      record.expectedResponseType,
      record.actualResponseType,
      record.primaryComplaintFamily,
    ].join("|");
    if (!groups.has(key)) {
      groups.set(key, {
        blockerId: key,
        safetySeverity: record.safetySeverity,
        rootCauseBucket: record.rootCauseBucket,
        riskTier: record.riskTier,
        expectedResponseType: record.expectedResponseType,
        actualResponseType: record.actualResponseType,
        complaintFamily: record.primaryComplaintFamily,
        uniqueCaseIds: [],
        failureOccurrenceCount: 0,
        exampleCases: [],
        notes: new Set(),
      });
    }
    const group = groups.get(key);
    group.uniqueCaseIds.push(record.caseId);
    group.failureOccurrenceCount += record.failureOccurrenceCount;
    if (group.exampleCases.length < 5) {
      group.exampleCases.push({
        caseId: record.caseId,
        description: record.description,
      });
    }
    group.notes.add(record.rootCauseReason);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      uniqueCaseCount: group.uniqueCaseIds.length,
      uniqueCaseIds: group.uniqueCaseIds.sort(),
      notes: [...group.notes].sort(),
      sortSeverityRank: SEVERITY_ORDER[group.safetySeverity] ?? 99,
    }))
    .sort((left, right) => {
      if (left.sortSeverityRank !== right.sortSeverityRank) {
        return left.sortSeverityRank - right.sortSeverityRank;
      }
      if (right.uniqueCaseCount !== left.uniqueCaseCount) {
        return right.uniqueCaseCount - left.uniqueCaseCount;
      }
      if (right.failureOccurrenceCount !== left.failureOccurrenceCount) {
        return right.failureOccurrenceCount - left.failureOccurrenceCount;
      }
      return left.blockerId.localeCompare(right.blockerId);
    })
    .map((group, index) => ({
      rank: index + 1,
      ...group,
    }));
}

function buildComplaintFamilyRollup(caseLedger) {
  const groups = new Map();
  for (const record of caseLedger) {
    const key = [
      record.primaryComplaintFamily,
      record.rootCauseBucket,
      record.riskTier,
      record.actualResponseType,
      record.expectedResponseType,
    ].join("|");
    if (!groups.has(key)) {
      groups.set(key, {
        complaintFamily: record.primaryComplaintFamily,
        rootCauseBucket: record.rootCauseBucket,
        riskTier: record.riskTier,
        actualResponseType: record.actualResponseType,
        expectedResponseType: record.expectedResponseType,
        uniqueCaseIds: [],
        failureOccurrenceCount: 0,
      });
    }
    const group = groups.get(key);
    group.uniqueCaseIds.push(record.caseId);
    group.failureOccurrenceCount += record.failureOccurrenceCount;
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      uniqueCaseCount: group.uniqueCaseIds.length,
      uniqueCaseIds: group.uniqueCaseIds.sort(),
    }))
    .sort((left, right) => {
      if (right.uniqueCaseCount !== left.uniqueCaseCount) {
        return right.uniqueCaseCount - left.uniqueCaseCount;
      }
      if (right.failureOccurrenceCount !== left.failureOccurrenceCount) {
        return right.failureOccurrenceCount - left.failureOccurrenceCount;
      }
      return left.complaintFamily.localeCompare(right.complaintFamily);
    });
}

function buildCriticalCaseCallouts(caseLedger) {
  const orderedIds = [
    "cardiac-emergency-collapse-after-excitement",
    "cardiac-emergency-collapse-blue-gums",
    "cardiac-emergency-rapid-breathing-pale",
    "cardiac-emergency-resting-breathing-distress",
    "emergency-acute-paralysis",
    "emergency-addisonian-crisis",
    "emergency-allergic-reaction-hives",
    "emergency-anaphylaxis",
  ];
  const map = new Map(caseLedger.map((record) => [record.caseId, record]));
  return orderedIds
    .map((caseId) => map.get(caseId))
    .filter(Boolean)
    .map((record) => ({
      caseId: record.caseId,
      complaintFamily: record.primaryComplaintFamily,
      rootCauseBucket: record.rootCauseBucket,
      actualResponseType: record.actualResponseType,
      expectedResponseType: record.expectedResponseType,
      reason: record.rootCauseReason,
    }));
}

function buildResidualBlockerLedger(options) {
  const suiteCaseMap = buildSuiteCaseMap(options.suiteCases);
  const caseLedger = buildCaseLedgerEntries(options.scorecard, suiteCaseMap);
  const bucketSummary = buildBucketSummary(caseLedger);
  const residualBlockers = buildResidualBlockers(caseLedger);
  const complaintFamilyGroups = buildComplaintFamilyRollup(caseLedger);
  const criticalCaseCallouts = buildCriticalCaseCallouts(caseLedger);

  return {
    generatedAt: new Date().toISOString(),
    generatedFrom: {
      scorecardPath: options.scorecardPath,
      suitePath: options.suitePath,
      scorecardGeneratedAt: options.scorecard.generatedAt || null,
      scorecardRunId: options.scorecard.runId || null,
      suiteId: options.scorecard.suiteId || null,
      baseUrl: options.scorecard.baseUrl || null,
      passFail: options.scorecard.passFail || null,
    },
    ordering: {
      primary: "safety_severity",
      secondary: "unique_case_count",
      tertiary: "failure_occurrence_count",
    },
    scope: {
      riskTier: "tier_1_emergency",
      expectedResponseType: "emergency",
      actualResponseTypesObserved: [...new Set(caseLedger.map((record) => record.actualResponseType))].sort(),
    },
    summary: {
      uniqueEmergencyFailureCases: caseLedger.length,
      emergencyFailureOccurrences: caseLedger.reduce(
        (total, record) => total + record.failureOccurrenceCount,
        0
      ),
      bucketsWithFindings: bucketSummary.filter((entry) => entry.uniqueCaseCount > 0).length,
    },
    requiredBuckets: bucketSummary,
    residualBlockers,
    complaintFamilyGroups,
    criticalCaseCallouts,
    caseLedger,
  };
}

function renderTable(headers, rows) {
  const header = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  return [header, divider, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

function renderResidualBlockerMarkdown(ledger) {
  const bucketRows = ledger.requiredBuckets.map((entry) => [
    `\`${entry.rootCauseBucket}\``,
    String(entry.uniqueCaseCount),
    String(entry.failureOccurrenceCount),
    entry.complaintFamilies.slice(0, 3).join(", ") || "_none_",
  ]);

  const blockerRows = ledger.residualBlockers.slice(0, 10).map((entry) => [
    String(entry.rank),
    `\`${entry.rootCauseBucket}\``,
    `\`${entry.complaintFamily}\``,
    entry.actualResponseType,
    String(entry.uniqueCaseCount),
    entry.exampleCases.map((example) => example.caseId).join(", "),
  ]);

  const callouts = ledger.criticalCaseCallouts
    .map(
      (entry) =>
        `- \`${entry.caseId}\` -> \`${entry.rootCauseBucket}\` (${entry.complaintFamily}) — ${entry.reason}`
    )
    .join("\n");

  return `# Wave 3 Emergency Baseline Debug

- Generated at: ${ledger.generatedAt}
- Source scorecard: \`${ledger.generatedFrom.scorecardPath}\`
- Source suite: \`${ledger.generatedFrom.suitePath}\`
- Scorecard generated at: ${ledger.generatedFrom.scorecardGeneratedAt || "unknown"}
- Base URL captured in source scorecard: ${ledger.generatedFrom.baseUrl || "unknown"}
- Scope: tier 1 emergency cases expected to return \`emergency\`

## Snapshot

- Unique emergency failure cases: ${ledger.summary.uniqueEmergencyFailureCases}
- Emergency failure occurrences: ${ledger.summary.emergencyFailureOccurrences}
- Actual response types observed: ${ledger.scope.actualResponseTypesObserved.join(", ") || "none"}
- Ordered blocker groups: ${ledger.residualBlockers.length}

## Root-Cause Buckets

${renderTable(
    ["Bucket", "Unique cases", "Occurrences", "Top complaint families"],
    bucketRows
  )}

## Ordered Residual Blockers

${renderTable(
    ["Rank", "Bucket", "Complaint family", "Actual", "Unique cases", "Example cases"],
    blockerRows
  )}

## Critical Case Callouts

${callouts || "_No explicit critical callouts captured._"}
`;
}

module.exports = {
  REQUIRED_BUCKETS,
  buildResidualBlockerLedger,
  loadSuiteCases,
  readJson,
  renderResidualBlockerMarkdown,
  writeJson,
  writeText,
};
