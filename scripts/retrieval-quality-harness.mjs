import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const defaultCasesPath = path.join(
  rootDir,
  "data",
  "retrieval-harness",
  "canine-cases.json"
);
const defaultBaselinePath = path.join(
  rootDir,
  "data",
  "retrieval-harness",
  "baseline.pre-reindex.json"
);
const defaultSnapshotPath = path.join(
  rootDir,
  "data",
  "retrieval-harness",
  "latest-run.json"
);

for (const relativePath of [".env.sidecars", ".env.local", ".env"]) {
  loadEnvFile(path.join(rootDir, relativePath));
}

const TEXT_RETRIEVAL_URL =
  process.env.HF_TEXT_RETRIEVAL_URL?.trim() ||
  process.env.TEXT_RETRIEVAL_URL?.trim() ||
  process.env.HF_RETRIEVAL_SERVICE_URL?.trim() ||
  "";
const IMAGE_RETRIEVAL_URL =
  process.env.HF_IMAGE_RETRIEVAL_URL?.trim() ||
  process.env.IMAGE_RETRIEVAL_URL?.trim() ||
  process.env.HF_RETRIEVAL_SERVICE_URL?.trim() ||
  "";
const SIDECAR_API_KEY = process.env.HF_SIDECAR_API_KEY?.trim() || "";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  process.env.SUPABASE_URL?.trim() ||
  "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  process.env.SUPABASE_ANON_KEY?.trim() ||
  "";
const DOMAIN_HINTS = {
  ear: ["ear", "otitis", "ear flap", "ear canal", "mites"],
  eye: ["eye", "ocular", "cornea", "eyelid", "conjunct"],
  skin_wound: [
    "skin",
    "wound",
    "lesion",
    "hot spot",
    "hotspot",
    "ringworm",
    "fungal",
    "mange",
    "tick",
    "dermatitis",
    "rash",
    "abscess",
  ],
  stool_vomit: ["vomit", "vomiting", "stool", "poop", "diarrhea", "diarrhoea"],
};
const NON_DOG_MARKERS = new Set([
  "cat",
  "cats",
  "kitten",
  "feline",
  "horse",
  "equine",
  "cow",
  "bovine",
  "goat",
  "sheep",
]);
const CONDITION_LABEL_ALIASES = [
  ["healthy_skin", ["healthy skin", "normal skin", "healthy"]],
  ["ringworm", ["ringworm", "dermatophyte"]],
  ["fungal_infection", ["fungal infection", "fungal", "yeast"]],
  ["demodicosis_mange", ["demodicosis", "demodectic mange", "mange"]],
  [
    "hypersensitivity_allergic",
    [
      "hypersensitivity allergic",
      "hypersensitivity",
      "allergic dermatitis",
      "allergic",
    ],
  ],
  ["bacterial_dermatosis", ["bacterial", "pyoderma"]],
  ["dermatitis", ["dermatitis"]],
  ["hot_spot", ["hot spot", "hotspot", "moist dermatitis"]],
  ["tick_infestation", ["tick infestation", "tick"]],
  ["eye_infection", ["eye infection", "conjunctivitis"]],
  ["ear_infection", ["ear infection", "otitis"]],
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readArgs(argv) {
  return {
    baselinePath: readPathArg(argv, "--baseline", defaultBaselinePath),
    casesPath: readPathArg(argv, "--cases", defaultCasesPath),
    json: argv.includes("--json"),
    noCompare: argv.includes("--no-compare"),
    snapshotPath: readPathArg(argv, "--snapshot", defaultSnapshotPath),
    writeBaseline: argv.includes("--write-baseline"),
  };
}

function readPathArg(argv, flag, fallbackPath) {
  const prefixed = argv.find((entry) => entry.startsWith(`${flag}=`));
  if (!prefixed) return fallbackPath;
  return path.resolve(rootDir, prefixed.split("=")[1]);
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeTerm(value) {
  return normalizeText(value).replace(/[_-]+/g, " ");
}

function tokenizeText(value) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

function dedupeTerms(values) {
  const seen = new Set();
  const ordered = [];
  for (const value of values) {
    const normalized = normalizeTerm(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

function buildSearchTerms(testCase) {
  return dedupeTerms([
    testCase.query,
    ...(testCase.conditionHints || []),
    testCase.breed || "",
    testCase.domain || "",
  ]);
}

function isSupabaseConfigured() {
  return (
    (SUPABASE_URL.startsWith("http://") || SUPABASE_URL.startsWith("https://")) &&
    Boolean(SUPABASE_KEY)
  );
}

function buildHeaders() {
  return {
    "Content-Type": "application/json",
    ...(SIDECAR_API_KEY ? { Authorization: `Bearer ${SIDECAR_API_KEY}` } : {}),
  };
}

async function postJson(url, payload, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const rawText = await response.text();
    const body = rawText ? JSON.parse(rawText) : {};
    return {
      body,
      latencyMs: Date.now() - startedAt,
      ok: response.ok,
      status: response.status,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildSupabaseHeaders() {
  return {
    Authorization: `Bearer ${SUPABASE_KEY}`,
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
  };
}

async function fetchSupabaseJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildSupabaseHeaders(),
      ...(options.headers || {}),
    },
  });
  const rawText = await response.text();
  const body = rawText ? JSON.parse(rawText) : null;
  if (!response.ok) {
    throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function fetchSupabaseRpc(name, payload) {
  return fetchSupabaseJson(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function supportsDogOnlyText(value, dogOnly) {
  if (!dogOnly) return true;
  const tokens = tokenizeText(value);
  return !tokens.some((token) => NON_DOG_MARKERS.has(token));
}

function supportsDomainText(value, domain) {
  const normalizedDomain = normalizeText(domain).replace(/\s+/g, "_");
  if (!normalizedDomain || normalizedDomain === "unsupported") return true;
  const hints = DOMAIN_HINTS[normalizedDomain] || [];
  const haystack = normalizeText(value);
  return hints.length === 0 || hints.some((hint) => haystack.includes(hint));
}

function summarizeText(value, maxChars = 320) {
  const compact = String(value || "").trim().replace(/\s+/g, " ");
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars - 3).trimEnd()}...`;
}

function buildTextFallbackFilter(searchTerms) {
  const tokens = dedupeTerms(searchTerms)
    .flatMap((value) => tokenizeText(value))
    .slice(0, 6);
  return tokens.map((token) => `text_content.ilike.*${token}*`).join(",");
}

async function fetchTextCandidates(searchTerms, limit) {
  const query = searchTerms.slice(0, 8).join(" ");
  try {
    const rpcRows = await fetchSupabaseRpc("search_knowledge_chunks", {
      match_count: limit,
      search_text: query,
    });
    if (Array.isArray(rpcRows) && rpcRows.length > 0) {
      return rpcRows;
    }
  } catch {}

  const orFilter = buildTextFallbackFilter(searchTerms);
  if (!orFilter) return [];

  const url = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/knowledge_chunks`);
  url.searchParams.set(
    "select",
    "id,source_id,title,text_content,citation,keyword_tags,source_url"
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("or", `(${orFilter})`);

  const rows = await fetchSupabaseJson(url.toString());
  return Array.isArray(rows) ? rows : [];
}

function scoreTextCandidate(row, testCase, searchTerms) {
  const blob = normalizeText(
    [
      row.source_title || "",
      row.chunk_title || row.title || "",
      row.text_content || "",
      ...(row.keyword_tags || []),
    ].join(" ")
  );
  if (!supportsDogOnlyText(blob, testCase.dogOnly ?? true)) return Number.NEGATIVE_INFINITY;
  if (!supportsDomainText(blob, testCase.domain)) return Number.NEGATIVE_INFINITY;

  const lexicalBase = Number(row.score || 0);
  const termHits = searchTerms.filter((term) => blob.includes(term)).length;
  const hintHits = (testCase.conditionHints || []).filter((hint) =>
    blob.includes(normalizeTerm(hint))
  ).length;
  return lexicalBase * 10 + termHits * 1.5 + hintHits * 2;
}

async function queryTextFromSupabase(testCase) {
  const startedAt = Date.now();
  const searchTerms = buildSearchTerms(testCase);
  const candidateLimit = Math.max((testCase.limit || 5) * 4, 18);
  const candidates = await fetchTextCandidates(searchTerms, candidateLimit);

  const ranked = candidates
    .map((candidate) => [scoreTextCandidate(candidate, testCase, searchTerms), candidate])
    .filter(([score]) => Number.isFinite(score) && score > Number.NEGATIVE_INFINITY)
    .sort((left, right) => right[0] - left[0])
    .slice(0, Math.max(1, testCase.limit || 5));

  return {
    latencyMs: Date.now() - startedAt,
    text_chunks: ranked.map(([score, row]) => ({
      citation: row.citation || row.source_url || row.source_title || null,
      score: Number(score.toFixed(4)),
      summary: summarizeText(row.text_content),
      title: row.chunk_title || row.title || row.source_title || "Veterinary Reference",
    })),
  };
}

function sourceLiveDomains(source) {
  const metadata = source?.metadata || {};
  const list = Array.isArray(metadata.live_domains) ? metadata.live_domains : [];
  if (list.length > 0) {
    return list.map((value) => normalizeText(value).replace(/\s+/g, "_")).filter(Boolean);
  }
  const single = normalizeText(metadata.live_domain);
  return single ? [single.replace(/\s+/g, "_")] : [];
}

function inferConditionFilters(testCase) {
  const labels = new Set(
    (testCase.conditionHints || [])
      .map((value) => normalizeText(value).replace(/\s+/g, "_"))
      .filter(Boolean)
  );
  const joined = buildSearchTerms(testCase).join(" ");

  for (const [label, aliases] of CONDITION_LABEL_ALIASES) {
    if (aliases.some((alias) => joined.includes(alias))) {
      labels.add(label);
    }
  }

  return [...labels];
}

function isLiveSource(source, testCase) {
  const metadata = source?.metadata || {};
  const liveStatus = normalizeText(metadata.live_retrieval_status);
  if (liveStatus && liveStatus !== "live") return false;

  if (testCase.dogOnly ?? true) {
    const speciesScope = normalizeText(metadata.species_scope);
    if (speciesScope && speciesScope !== "dog") return false;
  }

  const normalizedDomain = normalizeText(testCase.domain).replace(/\s+/g, "_");
  const liveDomains = sourceLiveDomains(source);
  if (normalizedDomain && normalizedDomain !== "unsupported" && liveDomains.length > 0) {
    return liveDomains.includes(normalizedDomain);
  }

  return true;
}

async function fetchLiveSources(testCase) {
  const url = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/reference_image_sources`);
  url.searchParams.set("active", "eq.true");
  url.searchParams.set("limit", "100");
  url.searchParams.set("select", "id,slug,title,dataset_url,metadata,condition_labels");
  const rows = await fetchSupabaseJson(url.toString());
  const sources = Array.isArray(rows) ? rows : [];
  return sources.filter((source) => isLiveSource(source, testCase));
}

function buildAssetFilter(searchTerms) {
  const tokens = dedupeTerms(searchTerms)
    .flatMap((value) => tokenizeText(value))
    .slice(0, 6);
  const filters = [];
  for (const token of tokens) {
    filters.push(`condition_label.ilike.*${token}*`);
    filters.push(`caption.ilike.*${token}*`);
  }
  return filters.join(",");
}

async function fetchImageAssets(sourceIds, searchTerms, conditionFilters, limit) {
  const url = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/reference_image_assets`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set(
    "select",
    "id,source_id,condition_label,local_path,asset_url,caption,metadata"
  );
  url.searchParams.set("source_id", `in.(${sourceIds.join(",")})`);

  const assetFilter = buildAssetFilter(searchTerms);
  if (assetFilter) {
    url.searchParams.set("or", `(${assetFilter})`);
  } else if (conditionFilters.length > 0) {
    url.searchParams.set("condition_label", `in.(${conditionFilters.join(",")})`);
  }

  const rows = await fetchSupabaseJson(url.toString());
  return Array.isArray(rows) ? rows : [];
}

function inferAssetDomain(asset, source) {
  const sourceDomains = sourceLiveDomains(source);
  if (sourceDomains.length > 0) return sourceDomains[0];

  const metadata = asset?.metadata || {};
  const liveDomain = normalizeText(metadata.live_domain);
  if (liveDomain) return liveDomain.replace(/\s+/g, "_");

  const haystack = normalizeText(
    [asset.condition_label || "", asset.caption || "", metadata.raw_label || ""].join(" ")
  );
  for (const [domain, hints] of Object.entries(DOMAIN_HINTS)) {
    if (hints.some((hint) => haystack.includes(hint))) {
      return domain;
    }
  }
  return null;
}

function scoreImageAsset(asset, source, testCase, searchTerms, conditionFilters) {
  const blob = normalizeText(
    [
      source.title || "",
      asset.condition_label || "",
      asset.caption || "",
      asset.metadata?.raw_label || "",
    ].join(" ")
  );
  const normalizedDomain = normalizeText(testCase.domain).replace(/\s+/g, "_");
  const assetDomain = inferAssetDomain(asset, source);
  if (
    normalizedDomain &&
    normalizedDomain !== "unsupported" &&
    assetDomain &&
    assetDomain !== normalizedDomain
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const conditionLabel = normalizeText(asset.condition_label).replace(/\s+/g, "_");
  const termHits = searchTerms.filter((term) => blob.includes(term)).length;
  const conditionBonus = conditionFilters.includes(conditionLabel) ? 3 : 0;
  const breedBonus =
    testCase.breed && blob.includes(normalizeTerm(testCase.breed)) ? 0.75 : 0;
  const domainBonus = assetDomain && assetDomain === normalizedDomain ? 1.5 : 0;
  return termHits * 1.2 + conditionBonus + breedBonus + domainBonus;
}

async function queryImageFromSupabase(testCase) {
  const startedAt = Date.now();
  const sources = await fetchLiveSources(testCase);
  if (sources.length === 0) {
    return { image_matches: [], latencyMs: Date.now() - startedAt };
  }

  const searchTerms = buildSearchTerms(testCase);
  const conditionFilters = inferConditionFilters(testCase);
  const candidateLimit = Math.max((testCase.limit || 5) * 12, 60);
  const assets = await fetchImageAssets(
    sources.map((source) => source.id),
    searchTerms,
    conditionFilters,
    candidateLimit
  );
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  const ranked = assets
    .map((asset) => {
      const source = sourceById.get(asset.source_id);
      if (!source) return null;
      const score = scoreImageAsset(asset, source, testCase, searchTerms, conditionFilters);
      if (!Number.isFinite(score) || score === Number.NEGATIVE_INFINITY) return null;
      return { asset, score, source };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, testCase.limit || 5));

  return {
    latencyMs: Date.now() - startedAt,
    image_matches: ranked.map(({ asset, score, source }) => ({
      citation: source.dataset_url || source.title || null,
      condition_label: asset.condition_label || null,
      dog_only: normalizeText(source?.metadata?.species_scope) !== "mixed",
      domain: inferAssetDomain(asset, source),
      score: Number(score.toFixed(4)),
      summary: [asset.condition_label, asset.caption].filter(Boolean).join(" - "),
      title: `${source.title || "Reference image"}: ${asset.condition_label || ""}`.trim(),
    })),
  };
}

function readCases(casesPath) {
  const parsed = JSON.parse(fs.readFileSync(casesPath, "utf8"));
  return Array.isArray(parsed?.cases) ? parsed.cases : [];
}

function expectedTermsMatched(expectations, haystacks) {
  const expected = Array.isArray(expectations?.mustIncludeAny)
    ? expectations.mustIncludeAny.map(normalizeText).filter(Boolean)
    : [];

  return expected.filter((term) =>
    haystacks.some((haystack) => haystack.includes(term))
  );
}

function labelsMatched(expectations, labels) {
  const expected = Array.isArray(expectations?.conditionLabels)
    ? expectations.conditionLabels.map(normalizeText).filter(Boolean)
    : [];
  return expected.filter((label) => labels.includes(label));
}

function topLabelMatched(expectations, topLabel) {
  const expected = Array.isArray(expectations?.topConditionLabels)
    ? expectations.topConditionLabels.map(normalizeText).filter(Boolean)
    : [];
  if (!expected.length) return true;
  return expected.includes(normalizeText(topLabel));
}

function addFailure(failures, condition, message) {
  if (!condition) return;
  failures.push(message);
}

function evaluateTextCase(testCase, response, latencyMs) {
  const results = Array.isArray(response?.text_chunks)
    ? response.text_chunks.map((entry) => ({
        citation: String(entry?.citation || "").trim() || null,
        score: Number(entry?.score || 0),
        summary: String(entry?.summary || "").trim(),
        title: String(entry?.title || "").trim() || "Veterinary Reference",
      }))
    : [];
  const haystacks = results.map((entry) =>
    normalizeText([entry.title, entry.citation || "", entry.summary].join(" "))
  );
  const failures = [];
  const matchedTerms = expectedTermsMatched(testCase.expectations, haystacks);

  addFailure(
    failures,
    results.length < Number(testCase.expectations?.minResults || 0),
    `Expected at least ${testCase.expectations.minResults} result(s)`
  );
  addFailure(
    failures,
    Array.isArray(testCase.expectations?.mustIncludeAny) &&
      testCase.expectations.mustIncludeAny.length > 0 &&
      matchedTerms.length === 0,
    `Expected any of ${testCase.expectations.mustIncludeAny.join(", ")} in text results`
  );

  return {
    id: testCase.id,
    kind: testCase.kind,
    name: testCase.name,
    latencyMs,
    passed: failures.length === 0,
    failures,
    matchedSignals: matchedTerms,
    query: testCase.query,
    resultCount: results.length,
    resultKeys: results
      .slice(0, 3)
      .flatMap((entry) => [entry.title, entry.citation || ""])
      .map(normalizeText)
      .filter(Boolean),
    results,
  };
}

function evaluateImageCase(testCase, response, latencyMs) {
  const results = Array.isArray(response?.image_matches)
    ? response.image_matches.map((entry) => ({
        citation: String(entry?.citation || "").trim() || null,
        conditionLabel:
          String(entry?.condition_label || "").trim() || null,
        dogOnly: entry?.dog_only === true,
        domain: String(entry?.domain || "").trim() || null,
        score: Number(entry?.score || 0),
        summary: String(entry?.summary || "").trim(),
        title: String(entry?.title || "").trim() || "Reference Image",
      }))
    : [];
  const labels = results
    .map((entry) => normalizeText(entry.conditionLabel))
    .filter(Boolean);
  const failures = [];
  const matchedLabels = labelsMatched(testCase.expectations, labels);
  const topLabel = results[0]?.conditionLabel || null;

  addFailure(
    failures,
    results.length < Number(testCase.expectations?.minResults || 0),
    `Expected at least ${testCase.expectations.minResults} result(s)`
  );
  addFailure(
    failures,
    Array.isArray(testCase.expectations?.conditionLabels) &&
      testCase.expectations.conditionLabels.length > 0 &&
      matchedLabels.length === 0,
    `Expected any of ${testCase.expectations.conditionLabels.join(", ")} in image labels`
  );
  addFailure(
    failures,
    !topLabelMatched(testCase.expectations, topLabel),
    `Expected top label in ${testCase.expectations.topConditionLabels.join(", ")}`
  );

  return {
    id: testCase.id,
    kind: testCase.kind,
    name: testCase.name,
    latencyMs,
    passed: failures.length === 0,
    failures,
    matchedSignals: matchedLabels,
    query: testCase.query,
    resultCount: results.length,
    resultKeys: results
      .slice(0, 3)
      .map((entry) => normalizeText(entry.conditionLabel || entry.title))
      .filter(Boolean),
    results,
    topConditionLabel: topLabel,
  };
}

async function runCase(testCase) {
  const hasSidecarUrl =
    testCase.kind === "image" ? Boolean(IMAGE_RETRIEVAL_URL) : Boolean(TEXT_RETRIEVAL_URL);

  if (hasSidecarUrl) {
    const requestBody = {
      breed: testCase.breed || null,
      condition_hints: testCase.conditionHints || [],
      dog_only: testCase.dogOnly ?? true,
      domain: testCase.domain || null,
      image_limit: testCase.limit || 5,
      query: testCase.query,
      text_limit: testCase.limit || 5,
    };
    const url =
      testCase.kind === "image" ? IMAGE_RETRIEVAL_URL : TEXT_RETRIEVAL_URL;
    const response = await postJson(url, requestBody);
    if (!response.ok) {
      throw new Error(
        `${testCase.id} failed (${response.status}): ${JSON.stringify(response.body)}`
      );
    }

    return testCase.kind === "image"
      ? evaluateImageCase(testCase, response.body, response.latencyMs)
      : evaluateTextCase(testCase, response.body, response.latencyMs);
  }

  if (!isSupabaseConfigured()) {
    throw new Error(
      `Missing ${testCase.kind} retrieval URL environment variable and Supabase fallback is not configured`
    );
  }

  const response =
    testCase.kind === "image"
      ? await queryImageFromSupabase(testCase)
      : await queryTextFromSupabase(testCase);

  return testCase.kind === "image"
    ? evaluateImageCase(testCase, response, response.latencyMs)
    : evaluateTextCase(testCase, response, response.latencyMs);
}

function summarizeResults(caseResults) {
  const passedCases = caseResults.filter((entry) => entry.passed).length;
  const failedCases = caseResults.length - passedCases;
  const averageLatencyMs =
    caseResults.length === 0
      ? 0
      : Math.round(
          caseResults.reduce((sum, entry) => sum + entry.latencyMs, 0) /
            caseResults.length
        );

  return {
    averageLatencyMs,
    failedCases,
    passedCases,
    totalCases: caseResults.length,
  };
}

function compareSnapshots(baseline, current) {
  const currentCases = new Map(current.caseResults.map((entry) => [entry.id, entry]));
  const regressions = [];
  const warnings = [];

  for (const baselineCase of baseline.caseResults || []) {
    const currentCase = currentCases.get(baselineCase.id);
    if (!currentCase) {
      regressions.push(`${baselineCase.id}: missing from current snapshot`);
      continue;
    }
    if (baselineCase.passed && !currentCase.passed) {
      regressions.push(
        `${baselineCase.id}: expectation regression (${currentCase.failures.join(" | ")})`
      );
    }
    if (baselineCase.resultCount > 0 && currentCase.resultCount === 0) {
      regressions.push(`${baselineCase.id}: lost all retrieval results`);
    }
    if (currentCase.resultCount < baselineCase.resultCount) {
      warnings.push(
        `${baselineCase.id}: result count dropped from ${baselineCase.resultCount} to ${currentCase.resultCount}`
      );
    }
    const overlap = baselineCase.resultKeys.filter((key) =>
      currentCase.resultKeys.includes(key)
    );
    if (
      baselineCase.resultKeys.length > 0 &&
      currentCase.resultKeys.length > 0 &&
      overlap.length === 0
    ) {
      warnings.push(`${baselineCase.id}: top retrieval keys changed completely`);
    }
  }

  return {
    ok: regressions.length === 0,
    regressions,
    warnings,
  };
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, payload) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function buildSnapshot(caseResults, casesPath) {
  return {
    generatedAt: new Date().toISOString(),
    caseSetPath: path.relative(rootDir, casesPath),
    caseResults,
    imageRetrievalUrlConfigured: Boolean(IMAGE_RETRIEVAL_URL),
    retrievalBackend:
      Boolean(TEXT_RETRIEVAL_URL) || Boolean(IMAGE_RETRIEVAL_URL)
        ? "sidecar"
        : isSupabaseConfigured()
          ? "supabase-fallback"
          : "unconfigured",
    summary: summarizeResults(caseResults),
    supabaseConfigured: isSupabaseConfigured(),
    textRetrievalUrlConfigured: Boolean(TEXT_RETRIEVAL_URL),
  };
}

function printHumanSummary(snapshot, comparison, options) {
  console.log(
    `Retrieval harness: ${snapshot.summary.passedCases}/${snapshot.summary.totalCases} case(s) passed`
  );
  console.log(`Average latency: ${snapshot.summary.averageLatencyMs}ms`);
  console.log(`Snapshot: ${options.snapshotPath}`);

  if (options.writeBaseline) {
    console.log(`Baseline written: ${options.baselinePath}`);
    return;
  }

  if (!comparison) {
    console.log("Baseline comparison skipped");
    return;
  }

  console.log(
    `Baseline compare: ${comparison.ok ? "pass" : "fail"} (${comparison.regressions.length} regression(s), ${comparison.warnings.length} warning(s))`
  );

  for (const regression of comparison.regressions) {
    console.log(`- regression: ${regression}`);
  }
  for (const warning of comparison.warnings) {
    console.log(`- warning: ${warning}`);
  }
}

async function main() {
  const options = readArgs(process.argv.slice(2));
  const cases = readCases(options.casesPath);
  if (cases.length === 0) {
    throw new Error(`No retrieval harness cases found in ${options.casesPath}`);
  }

  const caseResults = [];
  for (const testCase of cases) {
    caseResults.push(await runCase(testCase));
  }

  const snapshot = buildSnapshot(caseResults, options.casesPath);
  writeJson(options.snapshotPath, snapshot);

  let comparison = null;
  if (options.writeBaseline) {
    writeJson(options.baselinePath, snapshot);
  } else if (!options.noCompare && fs.existsSync(options.baselinePath)) {
    const baseline = JSON.parse(fs.readFileSync(options.baselinePath, "utf8"));
    comparison = compareSnapshots(baseline, snapshot);
  }

  if (options.json) {
    console.log(JSON.stringify({ comparison, snapshot }, null, 2));
  } else {
    printHumanSummary(snapshot, comparison, options);
  }

  if (comparison && !comparison.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
