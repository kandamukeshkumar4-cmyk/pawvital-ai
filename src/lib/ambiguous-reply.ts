function normalizeAmbiguousReplyText(rawMessage: string): string {
  return rawMessage
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[,:;]+/g, " ")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

const AMBIGUOUS_UNKNOWN_EXACT_MATCHES = new Set([
  "not sure",
  "unsure",
  "not certain",
  "uncertain",
  "i don't know",
  "i dont know",
  "dont know",
  "do not know",
  "no idea",
  "i have no idea",
  "can't tell",
  "cant tell",
  "cannot tell",
  "hard to tell",
  "hard to say",
  "maybe",
  "maybe not",
  "not really sure",
  "kind of",
  "sort of",
  "i'm not sure",
  "im not sure",
  "not totally sure",
  "i'm not totally sure",
  "im not totally sure",
  "couldn't say",
  "couldnt say",
  "can't really say",
  "cant really say",
  "i couldn't say",
  "i couldnt say",
  "i can't really say",
  "i cant really say",
  "no way to tell",
]);

const AMBIGUOUS_UNKNOWN_PREFIXES = [
  "not sure",
  "i don't know",
  "i dont know",
  "i'm not sure",
  "im not sure",
  "not totally sure",
  "i'm not totally sure",
  "im not totally sure",
  "can't tell",
  "cant tell",
  "cannot tell",
  "hard to tell",
  "hard to say",
  "couldn't say",
  "couldnt say",
  "can't really say",
  "cant really say",
  "i couldn't say",
  "i couldnt say",
  "i can't really say",
  "i cant really say",
];

export function coerceAmbiguousReplyToUnknown(reply: string): "unknown" | null {
  const normalized = normalizeAmbiguousReplyText(reply);
  if (!normalized) {
    return null;
  }

  if (AMBIGUOUS_UNKNOWN_EXACT_MATCHES.has(normalized)) {
    return "unknown";
  }

  const matchedPrefix = AMBIGUOUS_UNKNOWN_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix} `)
  );
  return matchedPrefix ? "unknown" : null;
}
