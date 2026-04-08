// Usage: node scripts/build-breed-profiles.mjs [--dry-run]
// Env required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

const KNOWLEDGE_TABLE = "knowledge_chunks";
const OUTPUT_TABLE = "breed_risk_profiles";
const BATCH_SIZE = 500;
const UPSERT_BATCH_SIZE = 500;
const PROGRESS_INTERVAL = 1000;
const MIN_MENTION_COUNT = 3;
const DEFAULT_TOP_RESULTS = 10;

const DOG_BREEDS = [
  { name: "labrador", aliases: ["labrador", "labrador retriever"] },
  { name: "golden retriever", aliases: ["golden retriever", "golden"] },
  { name: "bulldog", aliases: ["bulldog", "english bulldog"] },
  { name: "poodle", aliases: ["poodle", "standard poodle", "miniature poodle"] },
  { name: "beagle", aliases: ["beagle"] },
  { name: "german shepherd", aliases: ["german shepherd", "german shepherd dog"] },
  { name: "yorkshire terrier", aliases: ["yorkshire terrier", "yorkie"] },
  { name: "boxer", aliases: ["boxer"] },
  { name: "dachshund", aliases: ["dachshund", "wiener dog"] },
  { name: "siberian husky", aliases: ["siberian husky", "husky"] },
  { name: "great dane", aliases: ["great dane"] },
  { name: "chihuahua", aliases: ["chihuahua"] },
  { name: "australian shepherd", aliases: ["australian shepherd", "aussie"] },
  { name: "doberman", aliases: ["doberman", "doberman pinscher"] },
  { name: "rottweiler", aliases: ["rottweiler", "rottie"] },
  { name: "border collie", aliases: ["border collie"] },
  { name: "shih tzu", aliases: ["shih tzu"] },
  { name: "maltese", aliases: ["maltese"] },
  { name: "pomeranian", aliases: ["pomeranian", "pom"] },
  { name: "cocker spaniel", aliases: ["cocker spaniel", "english cocker spaniel"] },
  { name: "cavalier king charles spaniel", aliases: ["cavalier king charles spaniel", "cavalier"] },
  { name: "bernese mountain dog", aliases: ["bernese mountain dog", "berner"] },
  { name: "australian cattle dog", aliases: ["australian cattle dog", "blue heeler", "heeler"] },
  { name: "pembroke welsh corgi", aliases: ["pembroke welsh corgi", "corgi"] },
  { name: "boston terrier", aliases: ["boston terrier"] },
  { name: "miniature schnauzer", aliases: ["miniature schnauzer", "mini schnauzer"] },
  { name: "shiba inu", aliases: ["shiba inu", "shiba"] },
  { name: "basset hound", aliases: ["basset hound"] },
  { name: "english springer spaniel", aliases: ["english springer spaniel", "springer spaniel"] },
  { name: "west highland white terrier", aliases: ["west highland white terrier", "westie"] },
  { name: "cane corso", aliases: ["cane corso"] },
  { name: "collie", aliases: ["collie", "rough collie"] },
  { name: "newfoundland", aliases: ["newfoundland", "newfie"] },
  { name: "weimaraner", aliases: ["weimaraner"] },
  { name: "saint bernard", aliases: ["saint bernard", "st bernard"] },
  { name: "whippet", aliases: ["whippet"] },
  { name: "pug", aliases: ["pug"] },
  { name: "akita", aliases: ["akita"] },
  { name: "samoyed", aliases: ["samoyed"] },
  { name: "belgian malinois", aliases: ["belgian malinois", "malinois"] },
  { name: "bichon frise", aliases: ["bichon frise", "bichon"] },
  { name: "french bulldog", aliases: ["french bulldog", "frenchie"] },
  { name: "staffordshire bull terrier", aliases: ["staffordshire bull terrier", "staffy"] },
  { name: "american pit bull terrier", aliases: ["american pit bull terrier", "pit bull", "pitbull"] },
  { name: "jack russell terrier", aliases: ["jack russell terrier", "jack russell"] },
  { name: "vizsla", aliases: ["vizsla"] },
  { name: "bloodhound", aliases: ["bloodhound"] },
  { name: "mastiff", aliases: ["mastiff", "english mastiff"] },
  { name: "bull terrier", aliases: ["bull terrier"] },
  { name: "alaskan malamute", aliases: ["alaskan malamute", "malamute"] },
];

const CAT_BREEDS = [
  { name: "persian", aliases: ["persian"] },
  { name: "siamese", aliases: ["siamese"] },
  { name: "maine coon", aliases: ["maine coon"] },
  { name: "ragdoll", aliases: ["ragdoll"] },
  { name: "bengal", aliases: ["bengal"] },
  { name: "british shorthair", aliases: ["british shorthair"] },
  { name: "abyssinian", aliases: ["abyssinian"] },
  { name: "scottish fold", aliases: ["scottish fold"] },
  { name: "russian blue", aliases: ["russian blue"] },
  { name: "burmese", aliases: ["burmese"] },
  { name: "sphynx", aliases: ["sphynx"] },
  { name: "american shorthair", aliases: ["american shorthair"] },
  { name: "norwegian forest cat", aliases: ["norwegian forest cat"] },
  { name: "birman", aliases: ["birman"] },
  { name: "devon rex", aliases: ["devon rex"] },
  { name: "cornish rex", aliases: ["cornish rex"] },
  { name: "oriental shorthair", aliases: ["oriental shorthair"] },
  { name: "himalayan", aliases: ["himalayan"] },
  { name: "exotic shorthair", aliases: ["exotic shorthair"] },
  { name: "savannah", aliases: ["savannah"] },
];

const CONDITIONS = [
  { name: "arthritis", aliases: ["arthritis"] },
  { name: "diabetes", aliases: ["diabetes", "diabetic"] },
  { name: "obesity", aliases: ["obesity", "obese"] },
  { name: "cancer", aliases: ["cancer", "neoplasia"] },
  { name: "lymphoma", aliases: ["lymphoma"] },
  { name: "hip dysplasia", aliases: ["hip dysplasia"] },
  { name: "epilepsy", aliases: ["epilepsy", "seizure disorder"] },
  { name: "hypothyroidism", aliases: ["hypothyroidism"] },
  { name: "hyperthyroidism", aliases: ["hyperthyroidism"] },
  { name: "cushing", aliases: ["cushing", "cushing's", "cushings"] },
  { name: "addison", aliases: ["addison", "addison's", "addisons"] },
  { name: "pancreatitis", aliases: ["pancreatitis"] },
  { name: "kidney disease", aliases: ["kidney disease", "chronic kidney disease"] },
  { name: "renal failure", aliases: ["renal failure", "kidney failure"] },
  { name: "heart disease", aliases: ["heart disease", "cardiac disease"] },
  { name: "cardiomyopathy", aliases: ["cardiomyopathy"] },
  { name: "allergies", aliases: ["allergies", "allergy"] },
  { name: "ear infection", aliases: ["ear infection", "otitis"] },
  { name: "dental disease", aliases: ["dental disease"] },
  { name: "periodontal", aliases: ["periodontal", "periodontal disease"] },
  { name: "urinary tract infection", aliases: ["urinary tract infection", "uti"] },
  { name: "bladder stones", aliases: ["bladder stones", "urolithiasis"] },
  { name: "liver disease", aliases: ["liver disease", "hepatic disease"] },
  { name: "gastroenteritis", aliases: ["gastroenteritis"] },
  { name: "parvovirus", aliases: ["parvovirus", "parvo"] },
  { name: "distemper", aliases: ["distemper"] },
  { name: "kennel cough", aliases: ["kennel cough"] },
  { name: "cataracts", aliases: ["cataracts", "cataract"] },
  { name: "glaucoma", aliases: ["glaucoma"] },
  { name: "skin infection", aliases: ["skin infection", "pyoderma"] },
  { name: "dermatitis", aliases: ["dermatitis"] },
  { name: "mange", aliases: ["mange"] },
  { name: "anxiety", aliases: ["anxiety"] },
  { name: "cognitive dysfunction", aliases: ["cognitive dysfunction", "canine cognitive dysfunction"] },
  { name: "bloat", aliases: ["bloat", "gdv"] },
  { name: "gastric dilatation", aliases: ["gastric dilatation", "gastric dilation"] },
  { name: "intervertebral disc", aliases: ["intervertebral disc", "ivdd"] },
  { name: "cruciate ligament", aliases: ["cruciate ligament", "cranial cruciate ligament"] },
  { name: "patellar luxation", aliases: ["patellar luxation"] },
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPatternFragment(value) {
  return escapeRegex(value.trim().toLowerCase()).replace(/\s+/g, "(?:[\\s-]+)");
}

function normalizeMatch(value) {
  return value.toLowerCase().trim().replace(/[-\s]+/g, " ").replace(/\s+'s$/g, "").replace(/'s$/g, "");
}

function buildMatcher(definitions) {
  const lookup = new Map();
  const patterns = [];

  for (const definition of definitions) {
    for (const alias of definition.aliases) {
      lookup.set(normalizeMatch(alias), definition.name);
      patterns.push(toPatternFragment(alias));
    }
  }

  patterns.sort((left, right) => right.length - left.length);

  return {
    lookup,
    regex: new RegExp(`\\b(?:${patterns.join("|")})\\b`, "gi"),
  };
}

function extractMatches(text, matcher) {
  if (!text) return [];

  matcher.regex.lastIndex = 0;
  const matches = Array.from(text.matchAll(matcher.regex), (match) => {
    const normalized = normalizeMatch(match[0]);
    return matcher.lookup.get(normalized) ?? normalized;
  });

  return [...new Set(matches)];
}

function clampRiskScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function chunkRecords(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "[breed-risk] Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY."
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const breedMatcher = buildMatcher([...DOG_BREEDS, ...CAT_BREEDS]);
  const conditionMatcher = buildMatcher(CONDITIONS);
  const breedSampleSizes = new Map();
  const pairMentions = new Map();
  const matchedConditions = new Set();

  let processedRows = 0;
  let totalRows = null;
  let nextProgressAt = PROGRESS_INTERVAL;

  for (let offset = 0; ; offset += BATCH_SIZE) {
    let query = supabase
      .from(KNOWLEDGE_TABLE)
      .select("content", offset === 0 ? { count: "exact" } : undefined)
      .range(offset, offset + BATCH_SIZE - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`[breed-risk] Failed to read ${KNOWLEDGE_TABLE}: ${error.message}`);
    }

    if (totalRows === null && typeof count === "number") {
      totalRows = count;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      const content = typeof row.content === "string" ? row.content : "";
      const breeds = extractMatches(content, breedMatcher);
      const conditions = extractMatches(content, conditionMatcher);

      for (const breed of breeds) {
        breedSampleSizes.set(breed, (breedSampleSizes.get(breed) ?? 0) + 1);
      }

      for (const condition of conditions) {
        matchedConditions.add(condition);
      }

      for (const breed of breeds) {
        for (const condition of conditions) {
          const pairKey = `${breed}::${condition}`;
          pairMentions.set(pairKey, (pairMentions.get(pairKey) ?? 0) + 1);
        }
      }
    }

    processedRows += data.length;

    while (processedRows >= nextProgressAt) {
      console.log(
        `[breed-risk] Processed ${processedRows}${typeof totalRows === "number" ? `/${totalRows}` : ""} knowledge chunks...`
      );
      nextProgressAt += PROGRESS_INTERVAL;
    }

    if (data.length < BATCH_SIZE) {
      break;
    }
  }

  const upsertRows = Array.from(pairMentions.entries())
    .map(([pairKey, mentionCount]) => {
      const [breed, condition] = pairKey.split("::");
      const sampleSize = breedSampleSizes.get(breed) ?? 0;
      const riskScore = clampRiskScore(
        sampleSize > 0 ? mentionCount / sampleSize : 0
      );

      return {
        breed,
        condition,
        mention_count: mentionCount,
        risk_score: Number(riskScore.toFixed(4)),
        sample_size: sampleSize,
        last_updated: new Date().toISOString(),
      };
    })
    .filter((row) => row.mention_count >= MIN_MENTION_COUNT)
    .sort((left, right) => {
      if (right.risk_score !== left.risk_score) {
        return right.risk_score - left.risk_score;
      }

      if (right.mention_count !== left.mention_count) {
        return right.mention_count - left.mention_count;
      }

      return left.breed.localeCompare(right.breed) ||
        left.condition.localeCompare(right.condition);
    });

  if (isDryRun) {
    console.log("[breed-risk] Dry run enabled. Top 10 breed-condition pairs:");
    console.table(
      upsertRows.slice(0, DEFAULT_TOP_RESULTS).map((row) => ({
        breed: row.breed,
        condition: row.condition,
        risk_score: row.risk_score,
        mention_count: row.mention_count,
        sample_size: row.sample_size,
      }))
    );
  } else {
    const batches = chunkRecords(upsertRows, UPSERT_BATCH_SIZE);

    for (const batch of batches) {
      const { error } = await supabase.from(OUTPUT_TABLE).upsert(batch, {
        onConflict: "breed,condition",
      });

      if (error) {
        throw new Error(`[breed-risk] Failed to upsert ${OUTPUT_TABLE}: ${error.message}`);
      }
    }
  }

  console.log(
    `[breed-risk] Summary: breeds=${breedSampleSizes.size}, conditions=${matchedConditions.size}, pairs=${upsertRows.length}`
  );
}

main().catch((error) => {
  console.error("[breed-risk] Build failed:", error);
  process.exit(1);
});