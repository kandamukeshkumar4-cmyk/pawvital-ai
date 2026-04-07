import { readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to index the local image corpus.");
  process.exit(1);
}

const corpusRoot = resolve(process.cwd(), "corpus", "images");
const isDryRun = process.argv.includes("--dry-run");
const dirArgIdx = process.argv.indexOf("--dir");
const dirFilter = dirArgIdx !== -1 ? process.argv[dirArgIdx + 1] : null;

const DATASET_CONFIGS = [
  {
    slug: "roboflow-dog-skin-disease-detection",
    folderName: "dog-skin-disease-classification",
    title: "Dog Skin Disease Detection Classification Dataset",
    datasetUrl:
      "https://universe.roboflow.com/animal-skin-disease-detection/dog-skin-disease-detection-6pgvk-m6ycv",
    license: "Roboflow Universe dataset terms",
    metadata: {
      provider: "Roboflow Universe",
      local_folder: "dog-skin-disease-classification",
    },
    speciesScope: "dog",
    liveRetrievalStatus: "live",
    liveDomains: ["skin_wound"],
  },
  {
    slug: "mendeley-dog-skin-disease-multispectral",
    folderName: "mendeley-dog-skin",
    title:
      "Classification of Pet Dog Skin Diseases Using Deep Learning With Images Captured From Multispectral Imaging Device",
    datasetUrl: "https://data.mendeley.com/datasets/5dbht54kw7/1",
    license: "CC BY 4.0",
    metadata: {
      provider: "Mendeley Data",
      local_folder: "mendeley-dog-skin",
    },
    speciesScope: "dog",
    liveRetrievalStatus: "live",
    liveDomains: ["skin_wound"],
  },
  {
    slug: "kaggle-dog-skin-diseases-5class",
    folderName: "kaggle-dog-skin-diseases",
    title: "Dog's Skin Diseases Image Dataset (6 classes including healthy skin)",
    datasetUrl:
      "https://www.kaggle.com/datasets/youssefmohmmed/dogs-skin-diseases-image-dataset",
    license: "Apache 2.0",
    metadata: {
      provider: "Kaggle",
      local_folder: "kaggle-dog-skin-diseases",
      classes: [
        "demodicosis",
        "dermatitis",
        "fungal_infections",
        "hypersensitivity",
        "ringworm",
      ],
    },
    speciesScope: "dog",
    liveRetrievalStatus: "live",
    liveDomains: ["skin_wound"],
  },
  {
    slug: "kaggle-pet-disease-images-dog",
    folderName: "kaggle-pet-disease-images",
    title: "Pet Disease Images — Dog Classes (11 conditions)",
    datasetUrl: "https://www.kaggle.com/datasets/smadive/pet-disease-images",
    license: "CC0 Public Domain",
    metadata: {
      provider: "Kaggle",
      local_folder: "kaggle-pet-disease-images",
      classes: [
        "dental_disease", "distemper", "eye_infection", "fungal_infection",
        "hot_spot", "kennel_cough", "mange", "parvovirus",
        "skin_allergy", "tick_infestation", "worm_infection",
      ],
    },
    speciesScope: "mixed",
    liveRetrievalStatus: "curated_subset",
    liveDomains: ["skin_wound", "eye"],
  },
  {
    slug: "roboflow-dog-skin-detection-4class",
    folderName: "roboflow-dog-skin-detection",
    title: "Dog Skin Disease Detection (mange, hotspot, flea_allergy, ringworm)",
    datasetUrl:
      "https://universe.roboflow.com/animal-skin-disease-detection/dog-skin-disease-detection-6pgvk",
    license: "CC BY 4.0",
    metadata: {
      provider: "Roboflow Universe",
      local_folder: "roboflow-dog-skin-detection",
      classes: ["mange", "hotspot", "flea_allergy", "ringworm"],
    },
    speciesScope: "dog",
    liveRetrievalStatus: "live",
    liveDomains: ["skin_wound"],
  },
  {
    slug: "kaggle-yashmotiani-dog-skin",
    folderName: "kaggle-yashmotiani-dog-skin",
    title: "Dog Skin Disease Dataset — Bacterial, Fungal, Hypersensitivity, Healthy (443 images)",
    datasetUrl: "https://www.kaggle.com/datasets/yashmotiani/dogs-skin-disease-dataset",
    license: "CC BY 4.0",
    metadata: {
      provider: "Kaggle",
      local_folder: "kaggle-yashmotiani-dog-skin",
      classes: ["bacterial_dermatosis", "fungal_infection", "hypersensitivity_allergic", "healthy_skin"],
    },
    speciesScope: "dog",
    liveRetrievalStatus: "live",
    liveDomains: ["skin_wound"],
  },
  {
    slug: "roboflow-tick-detection",
    folderName: "roboflow-tick-detection",
    title: "Tick Detection on Dogs Dataset",
    datasetUrl: "https://universe.roboflow.com/tick-detection/tick-detection",
    license: "CC BY 4.0",
    metadata: {
      provider: "Roboflow Universe",
      local_folder: "roboflow-tick-detection",
      classes: ["tick"],
    },
    speciesScope: "dog",
    liveRetrievalStatus: "live",
    liveDomains: ["skin_wound"],
  },
  {
    slug: "roboflow-dog-eye-disease",
    folderName: "roboflow-dog-eye-disease",
    title: "Dog Eye Disease Detection Dataset",
    datasetUrl: "https://universe.roboflow.com/dog-eye-disease/dog-eye-disease",
    license: "Roboflow Universe dataset terms",
    metadata: {
      provider: "Roboflow Universe",
      local_folder: "roboflow-dog-eye-disease",
    },
    speciesScope: "dog",
    liveRetrievalStatus: "live",
    liveDomains: ["eye"],
  },
  {
    slug: "roboflow-dog-skin-classification",
    folderName: "roboflow-dog-skin-classification",
    title: "Dog Skin Disease Classification Dataset",
    datasetUrl: "https://universe.roboflow.com/dog-skin-disease/dog-skin-classification",
    license: "Roboflow Universe dataset terms",
    metadata: {
      provider: "Roboflow Universe",
      local_folder: "roboflow-dog-skin-classification",
    },
    speciesScope: "dog",
    liveRetrievalStatus: "live",
    liveDomains: ["skin_wound"],
  },
];

function normalizeConditionLabel(label) {
  const compact = label.trim().toLowerCase();
  const LABEL_MAP = {
    healthy: "healthy_skin",
    demodicosis: "demodicosis_mange",
    dermatitis: "dermatitis",
    "fungal infections": "fungal_infection",
    "fungal_infections": "fungal_infection",
    "fungal infection": "fungal_infection",
    hypersensitivity: "hypersensitivity_allergic",
    "hypersensitivity dermatitis": "hypersensitivity_allergic",
    "hypersensitivity_allergic_dermatosis": "hypersensitivity_allergic",
    "hypersensitivity allergic dermatosis": "hypersensitivity_allergic",
    ringworm: "ringworm",
    mange: "demodicosis_mange",
    hotspot: "hot_spot",
    "hot spot": "hot_spot",
    flea_allergy: "flea_allergy_dermatitis",
    "flea allergy": "flea_allergy_dermatitis",
    tick: "tick_infestation",
    "tick infestation in dog": "tick_infestation",
    "bacterial dermatosis": "bacterial_dermatosis",
    "bacterial_dermatosis": "bacterial_dermatosis",
    "dental disease in dog": "dental_disease",
    "distemper in dog": "distemper",
    "eye infection in dog": "eye_infection",
    "fungal infection in dog": "fungal_infection",
    "hot spots in dog": "hot_spot",
    "kennel cough in dog": "kennel_cough",
    "mange in dog": "demodicosis_mange",
    "parvovirus in dog": "parvovirus",
    "skin allergy in dog": "skin_allergy",
    "worm infection in dog": "worm_infection",
    // Yashmotiani dataset
    "bacterial_dermatosis": "bacterial_dermatosis",
    // Smadive cat classes
    "dental disease in cat": "dental_disease",
    "ear mites in cat": "ear_mites",
    "eye infection in cat": "eye_infection",
    "feline leukemia": "feline_leukemia",
    "feline panleukopenia": "feline_panleukopenia",
    "fungal infection in cat": "fungal_infection",
    "ringworm in cat": "ringworm",
    "scabies in cat": "scabies",
    "skin allergy in cat": "skin_allergy",
    "urinary tract infection in cat": "uti",
    "worm infection in cat": "worm_infection",
  };
  if (LABEL_MAP[compact]) return LABEL_MAP[compact];
  return compact.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function inferLiveDomain(rawLabel, normalizedLabel) {
  const joined = `${rawLabel} ${normalizedLabel}`.toLowerCase();
  if (/eye|ocular|eyelid|conjunct|cornea/.test(joined)) return "eye";
  if (/ear|otitis|ear mites|ear_mites/.test(joined)) return "ear";
  if (/vomit|vomiting|stool|poop|diarrhea|diarrhoea|feces|faeces/.test(joined)) {
    return "stool_vomit";
  }
  if (
    /skin|wound|lesion|hot spot|hotspot|ringworm|fungal|mange|tick|allergy|dermat|rash|abscess|cut|abrasion/.test(
      joined
    )
  ) {
    return "skin_wound";
  }
  return "unsupported";
}

function inferSpeciesScope(rawLabel, dataset) {
  const joined = `${rawLabel} ${dataset.slug}`.toLowerCase();
  if (/cat|feline|kitten/.test(joined)) return "cat";
  if (/dog|canine/.test(joined)) return "dog";
  return dataset.speciesScope || "dog";
}

function deriveAssetPolicy(dataset, rawLabel, normalizedLabel) {
  const speciesScope = inferSpeciesScope(rawLabel, dataset);
  const liveDomain = inferLiveDomain(rawLabel, normalizedLabel);
  const domainAllowed =
    dataset.liveDomains?.includes(liveDomain) && liveDomain !== "unsupported";
  const liveRetrievalStatus =
    speciesScope === "dog" && domainAllowed ? "live" : "benchmark_only";

  return {
    speciesScope,
    liveDomain,
    liveRetrievalStatus,
  };
}

async function listImageFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(jpe?g|png|webp)$/i.test(entry.name))
    .map((entry) => resolve(dirPath, entry.name));
}

async function buildAssetsForDataset(dataset) {
  const datasetRoot = resolve(corpusRoot, dataset.folderName);
  const topEntries = await readdir(datasetRoot, { withFileTypes: true });
  const topDirs = topEntries.filter((entry) => entry.isDirectory());
  const assets = [];

  // Detect structure: split/label/images vs label/images
  // If first subdir contains subdirs with images → split/label structure
  // If first subdir contains images directly → label/images structure (flat)
  let isFlat = false;
  if (topDirs.length > 0) {
    const firstDir = resolve(datasetRoot, topDirs[0].name);
    const firstDirEntries = await readdir(firstDir, { withFileTypes: true });
    const hasImages = firstDirEntries.some(
      (e) => e.isFile() && /\.(jpe?g|png|webp)$/i.test(e.name)
    );
    const hasSubdirs = firstDirEntries.some((e) => e.isDirectory());
    // If images exist directly in the first subdir (and no further subdirs), it's flat
    if (hasImages && !hasSubdirs) {
      isFlat = true;
    }
  }

  if (isFlat) {
    // Flat structure: label/images (e.g., Kaggle datasets, Mendeley "all" folder)
    for (const labelDir of topDirs) {
      const rawLabel = labelDir.name;
      const normalizedLabel = normalizeConditionLabel(rawLabel);
      const assetPolicy = deriveAssetPolicy(dataset, rawLabel, normalizedLabel);
      const labelRoot = resolve(datasetRoot, rawLabel);
      const imageFiles = await listImageFiles(labelRoot);

      for (const imagePath of imageFiles) {
        assets.push({
          conditionLabel: normalizedLabel,
          localPath: imagePath,
          caption: `${rawLabel} example from ${dataset.title}`,
          metadata: {
            split: "all",
            raw_label: rawLabel,
            dataset_folder: dataset.folderName,
            relative_path: relative(process.cwd(), imagePath),
            species_scope: assetPolicy.speciesScope,
            live_retrieval_status: assetPolicy.liveRetrievalStatus,
            live_domain: assetPolicy.liveDomain,
            live_domains: dataset.liveDomains || [],
          },
        });
      }
    }
  } else {
    // Split structure: split/label/images (e.g., Roboflow train/test/valid)
    for (const splitDir of topDirs) {
      const splitName = splitDir.name;
      const splitRoot = resolve(datasetRoot, splitName);
      const labelEntries = await readdir(splitRoot, { withFileTypes: true });

      for (const labelDir of labelEntries.filter((entry) => entry.isDirectory())) {
        const rawLabel = labelDir.name;
        const normalizedLabel = normalizeConditionLabel(rawLabel);
        const assetPolicy = deriveAssetPolicy(dataset, rawLabel, normalizedLabel);
        const labelRoot = resolve(splitRoot, rawLabel);
        const imageFiles = await listImageFiles(labelRoot);

        for (const imagePath of imageFiles) {
          assets.push({
            conditionLabel: normalizedLabel,
            localPath: imagePath,
            caption: `${rawLabel} example from ${dataset.title}`,
            metadata: {
              split: splitName,
              raw_label: rawLabel,
              dataset_folder: dataset.folderName,
              relative_path: relative(process.cwd(), imagePath),
              species_scope: assetPolicy.speciesScope,
              live_retrieval_status: assetPolicy.liveRetrievalStatus,
              live_domain: assetPolicy.liveDomain,
              live_domains: dataset.liveDomains || [],
            },
          });
        }
      }
    }
  }

  return assets;
}

async function upsertSource(pool, dataset, assetCount, conditionLabels) {
  const result = await pool.query(
    `insert into public.reference_image_sources
      (slug, title, dataset_url, license, condition_labels, notes, metadata, active)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb, true)
     on conflict (slug) do update set
       title = excluded.title,
       dataset_url = excluded.dataset_url,
       license = excluded.license,
       condition_labels = excluded.condition_labels,
       notes = excluded.notes,
       metadata = excluded.metadata,
       active = true,
       updated_at = now()
     returning id`,
    [
      dataset.slug,
      dataset.title,
      dataset.datasetUrl,
      dataset.license,
      conditionLabels,
      `Local corpus indexed from ${dataset.folderName}`,
      JSON.stringify({
        ...(dataset.metadata || {}),
        image_count: assetCount,
        species_scope: dataset.speciesScope || "dog",
        live_retrieval_status: dataset.liveRetrievalStatus || "live",
        live_domains: dataset.liveDomains || [],
        indexed_at: new Date().toISOString(),
      }),
    ]
  );

  return result.rows[0].id;
}

async function deactivateSource(pool, dataset, reason) {
  await pool.query(
    `update public.reference_image_sources
        set active = false,
            condition_labels = '{}'::text[],
            notes = $2,
            metadata = coalesce(metadata, '{}'::jsonb) || $3::jsonb,
            updated_at = now()
      where slug = $1`,
    [
      dataset.slug,
      reason,
      JSON.stringify({
        ...(dataset.metadata || {}),
        deactivated_at: new Date().toISOString(),
        inactive_reason: reason,
      }),
    ]
  );
}

async function replaceAssets(pool, sourceId, assets) {
  const client = await pool.connect();
  const chunkSize = 200; // smaller batches to avoid statement timeout

  try {
    // Delete in its own transaction first
    await client.query("begin");
    // Delete in batches of 300, each in its own transaction
    await client.query("commit"); // close the outer begin
    let deleted = 0;
    while (true) {
      await client.query("begin");
      const res = await client.query(
        `delete from public.reference_image_assets
         where id in (
           select id from public.reference_image_assets
           where source_id = $1 limit 300
         )`,
        [sourceId]
      );
      await client.query("commit");
      deleted += res.rowCount || 0;
      if ((res.rowCount || 0) < 300) break;
    }
    if (deleted > 0) process.stdout.write(`(deleted ${deleted} old) `);

    // Insert in separate transactions per chunk to avoid statement timeout
    for (let index = 0; index < assets.length; index += chunkSize) {
      await client.query("begin");
      try {
        const chunk = assets.slice(index, index + chunkSize);
        const values = [];
        const placeholders = chunk.map((asset, chunkIndex) => {
          const base = chunkIndex * 5;
          values.push(
            sourceId,
            asset.conditionLabel,
            asset.localPath,
            asset.caption,
            JSON.stringify(asset.metadata)
          );
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, 'pending')`;
        });

        await client.query(
          `insert into public.reference_image_assets
            (source_id, condition_label, local_path, caption, metadata, embedding_status)
           values ${placeholders.join(", ")}`,
          values
        );
        await client.query("commit");
        process.stdout.write(".");
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }
    process.stdout.write("\n");
  } catch (error) {
    throw error;
  } finally {
    client.release();
  }
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes("supabase.co")
    ? { rejectUnauthorized: false }
    : undefined,
  max: 2,
});

try {
  for (const dataset of DATASET_CONFIGS) {
    if (dirFilter && dataset.folderName !== dirFilter) continue;
    const datasetRoot = resolve(corpusRoot, dataset.folderName);

    try {
      const assets = await buildAssetsForDataset(dataset);
      const conditionLabels = [...new Set(assets.map((asset) => asset.conditionLabel))];

      console.log(
        `${dataset.folderName}: ${assets.length} images across ${conditionLabels.length} classes`
      );

      if (assets.length === 0) {
        const reason = `No images found in ${dataset.folderName}; source marked inactive until files are added.`;
        console.warn(reason);
        if (!isDryRun) {
          await deactivateSource(pool, dataset, reason);
        }
        continue;
      }

      if (isDryRun) {
        continue;
      }

      const sourceId = await upsertSource(
        pool,
        dataset,
        assets.length,
        conditionLabels
      );
      await replaceAssets(pool, sourceId, assets);
    } catch (error) {
      console.warn(
        `Skipping ${datasetRoot} because it could not be indexed:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
} finally {
  await pool.end();
}
