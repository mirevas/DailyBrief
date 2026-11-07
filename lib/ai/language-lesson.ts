import fs from "node:fs";
import path from "node:path";
import { jsonrepair } from "jsonrepair";
import { extractJson } from "./json-util";
import { runLlm, getModelTag } from "./llm";

type Topic = { id: string; title: string; order: number; description: string };
type TopicTaxonomy = {
  level: "A2";
  selectionPolicy: { wordsPerLesson: number; targetWordsPerTopic: number };
  topics: Topic[];
};
type LessonWord = {
  entryId: string;
  lemma: string;
  term: string;
  entryType: "word" | "phrase";
  partOfSpeech: string;
  gender?: string;
  frequencyBand: "high";
  translation: { en: string; zh: string };
  pronunciation?: string;
  example: { es: string; en: string; zh: string };
};
type NewLessonWord = Omit<LessonWord, "entryId" | "frequencyBand">;
export type LanguageLesson = {
  schemaVersion: 1;
  lessonId: string;
  language: "es";
  level: "A2";
  topicId: string;
  title: string;
  newWordCount: number;
  createdAt: string;
  source: "llm" | "topic-lexicon";
  model: string;
  promptVersion: 2;
  items: LessonWord[];
};
type TopicLexicon = {
  schemaVersion: 1;
  topicId: string;
  title: string;
  level: "A2";
  generatedAt: string;
  source: "llm";
  model: string;
  promptVersion: 2;
  items: LessonWord[];
};

const TOPICS_PATH = "data/language/topics/taxonomy.json";
const LESSONS_DIR = "daily_reports/language/lessons";
const TOPIC_LEXICONS_DIR = "daily_reports/language/topics";
const USED_WORDS_PATH = "daily_reports/language/used-words.json";

type UsedWordIndexEntry = { normalized: string; topicIds: string[] };
type UsedWordIndex = { version: 1; entries: UsedWordIndexEntry[] };

function normalizeWord(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slug(value: string): string {
  return normalizeWord(value).replace(/\s+/g, "-");
}

function loadTaxonomy(): TopicTaxonomy {
  const data = JSON.parse(fs.readFileSync(TOPICS_PATH, "utf8")) as TopicTaxonomy;
  if (data.level !== "A2") throw new Error("Spanish topic taxonomy must use level A2.");
  if (!Number.isInteger(data.selectionPolicy?.wordsPerLesson) || data.selectionPolicy.wordsPerLesson < 1) {
    throw new Error("Taxonomy wordsPerLesson must be a positive integer.");
  }
  if (!Number.isInteger(data.selectionPolicy?.targetWordsPerTopic) || data.selectionPolicy.targetWordsPerTopic < 1) {
    throw new Error("Taxonomy targetWordsPerTopic must be a positive integer.");
  }
  return { ...data, topics: [...data.topics].sort((a, b) => a.order - b.order) };
}

function loadPreviousLessons(): LanguageLesson[] {
  if (!fs.existsSync(LESSONS_DIR)) return [];
  return fs.readdirSync(LESSONS_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(LESSONS_DIR, name), "utf8")) as LanguageLesson);
}

function loadTopicLexicons(): TopicLexicon[] {
  if (!fs.existsSync(TOPIC_LEXICONS_DIR)) return [];
  return fs.readdirSync(TOPIC_LEXICONS_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(TOPIC_LEXICONS_DIR, name), "utf8")) as TopicLexicon);
}

function addWords(index: Map<string, Set<string>>, topicId: string, items: LessonWord[]): void {
  for (const item of items ?? []) {
    for (const value of [item.lemma, item.term]) {
      const normalized = normalizeWord(value ?? "");
      if (!normalized) continue;
      const topicIds = index.get(normalized) ?? new Set<string>();
      topicIds.add(topicId);
      index.set(normalized, topicIds);
    }
  }
}

function buildAndStoreUsedWordIndex(lessons: LanguageLesson[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const lesson of lessons) addWords(index, lesson.topicId, lesson.items);
  const serialized: UsedWordIndex = {
    version: 1,
    entries: [...index.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([normalized, topicIds]) => ({ normalized, topicIds: [...topicIds].sort() })),
  };
  fs.mkdirSync(path.dirname(USED_WORDS_PATH), { recursive: true });
  atomicWrite(USED_WORDS_PATH, `${JSON.stringify(serialized, null, 2)}\n`);
  return index;
}

function validateResponse(
  value: unknown,
  topics: Topic[],
  usedWords: Set<string>,
): { topicId: string; items: NewLessonWord[]; skippedDuplicates: number; repairedEntryTypes: number } {
  if (!value || typeof value !== "object") throw new Error("Expected a JSON object.");
  const result = value as Record<string, unknown>;
  const topicId = result.topicId;
  if (!topics.some((candidate) => candidate.id === topicId)) throw new Error(`Unknown topic: ${String(topicId)}`);
  if (!Array.isArray(result.items)) throw new Error("Expected an items array.");

  const seen = new Set<string>();
  let skippedDuplicates = 0;
  let repairedEntryTypes = 0;
  const items = result.items.flatMap((raw, index): NewLessonWord[] => {
    if (!raw || typeof raw !== "object") throw new Error(`Word ${index + 1} is not an object.`);
    const item = raw as Record<string, unknown>;
    const lemma = typeof item.lemma === "string" ? item.lemma.trim() : "";
    const term = typeof item.term === "string" ? item.term.trim() : "";
    const normalizedLemma = normalizeWord(lemma);
    const normalizedTerm = normalizeWord(term);
    if (!lemma || !term || !normalizedLemma || !normalizedTerm) throw new Error(`Word ${index + 1} is missing lemma or term.`);
    if (seen.has(normalizedLemma) || seen.has(normalizedTerm) || usedWords.has(normalizedLemma) || usedWords.has(normalizedTerm)) {
      skippedDuplicates++;
      return [];
    }
    seen.add(normalizedLemma);
    seen.add(normalizedTerm);

    const entryType = item.entryType === "phrase" ? "phrase" : "word";
    if (item.entryType !== "word" && item.entryType !== "phrase") repairedEntryTypes++;
    const partOfSpeech = item.partOfSpeech;
    const translation = item.translation as Record<string, unknown> | undefined;
    const example = item.example as Record<string, unknown> | undefined;
    if (typeof partOfSpeech !== "string" || !partOfSpeech.trim()) throw new Error(`Missing part of speech for ${lemma}.`);
    if (typeof translation?.en !== "string" || !translation.en.trim() || typeof translation.zh !== "string" || !translation.zh.trim()) {
      throw new Error(`Missing English/Chinese translation for ${lemma}.`);
    }
    if (typeof example?.es !== "string" || !example.es.trim() || typeof example.en !== "string" || !example.en.trim() || typeof example.zh !== "string" || !example.zh.trim()) {
      throw new Error(`Missing Spanish/English/Chinese example for ${lemma}.`);
    }
    return [{
      lemma,
      term,
      entryType,
      partOfSpeech: partOfSpeech.trim(),
      ...(typeof item.gender === "string" && item.gender.trim() ? { gender: item.gender.trim() } : {}),
      translation: { en: translation.en.trim(), zh: translation.zh.trim() },
      ...(typeof item.pronunciation === "string" && item.pronunciation.trim() ? { pronunciation: item.pronunciation.trim() } : {}),
      example: { es: example.es.trim(), en: example.en.trim(), zh: example.zh.trim() },
    }];
  });
  return { topicId: String(topicId), items, skippedDuplicates, repairedEntryTypes };
}

function atomicWrite(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, contents, "utf8");
  fs.renameSync(tempPath, filePath);
}

function readJsonResponse(text: string): unknown {
  try {
    return JSON.parse(extractJson(text));
  } catch {
    return JSON.parse(jsonrepair(extractJson(text)));
  }
}

function collectUsedWords(lessons: LanguageLesson[], lexicons: TopicLexicon[]): Set<string> {
  const used = new Set<string>();
  for (const lesson of lessons) for (const item of lesson.items ?? []) {
    used.add(normalizeWord(item.lemma));
    used.add(normalizeWord(item.term));
  }
  for (const lexicon of lexicons) for (const item of lexicon.items ?? []) {
    used.add(normalizeWord(item.lemma));
    used.add(normalizeWord(item.term));
  }
  return used;
}

async function generateTopicLexicon(
  date: string,
  topic: Topic,
  topics: Topic[],
  alreadyUsed: Set<string>,
  previousSameTopicItems: LessonWord[],
  targetWords: number,
): Promise<TopicLexicon> {
  const acceptedItems: NewLessonWord[] = [];
  const excluded = new Set(alreadyUsed);
  const systemPrompt = [
    "You are an experienced Spanish teacher building a comprehensive A2 vocabulary list for one topic.",
    "Select genuinely useful, high-frequency words and short expressions a learner needs at A2 level.",
    "Order items from most useful/common to less frequent but still necessary at A2 level.",
    "Prefer canonical singular nouns and infinitive verbs as lemmas; avoid rare, regional-only, technical, and duplicate entries.",
    "Set entryType to exactly 'word' or 'phrase'. Single lexical entries, including verbs and reflexive verbs, use 'word'.",
    "Provide natural Spanish examples and accurate English and Simplified Chinese translations.",
    "Return only one valid JSON object, with no markdown or extra text.",
  ].join(" ");

  const userPrompt = [
    `Build the complete stored A2 lexicon for topic '${topic.id}' (${topic.title}): ${topic.description}`,
    `In one response, provide up to ${targetWords} distinct, useful A2 vocabulary items, ordered from most frequent and practical to less frequent. Include the core vocabulary a learner needs for this topic.`,
    "Keep every item inside this topic. Do not use any normalized lemma or term from the excluded list.",
    JSON.stringify([...excluded].sort()),
    "Use JSON shape: {\"topicId\":\"people\",\"items\":[{\"lemma\":\"...\",\"term\":\"...\",\"entryType\":\"word\",\"partOfSpeech\":\"noun\",\"gender\":\"feminine\",\"translation\":{\"en\":\"...\",\"zh\":\"...\"},\"pronunciation\":\"...\",\"example\":{\"es\":\"...\",\"en\":\"...\",\"zh\":\"...\"}}]}",
    "Use entryType 'word' or 'phrase'. Include gender only when relevant. Pronunciation may be omitted if uncertain.",
  ].join("\n");
  const response = await runLlm({ systemPrompt, userPrompt });
  const validated = validateResponse(readJsonResponse(response.text), topics, excluded);
  if (validated.topicId !== topic.id) throw new Error(`Expected topic '${topic.id}', got '${validated.topicId}'.`);
  acceptedItems.push(...validated.items.slice(0, targetWords));
  if (validated.repairedEntryTypes > 0) {
    console.warn(`[language] topic '${topic.id}': defaulted ${validated.repairedEntryTypes} invalid entryType value(s) to 'word'.`);
  }
  if (validated.items.length === 0 && previousSameTopicItems.length === 0) {
    throw new Error(`The model returned no new valid vocabulary entries for topic '${topic.id}'.`);
  }
  if (validated.skippedDuplicates > 0) {
    console.warn(`[language] topic '${topic.id}': skipped ${validated.skippedDuplicates} repeated word(s); saving the unique entries from this response.`);
  }

  // Keep older daily words in the topic catalog during migration, then append
  // the newly generated unlearned items in frequency order.
  const merged = [...previousSameTopicItems];
  const mergedWords = new Set(merged.flatMap((item) => [normalizeWord(item.lemma), normalizeWord(item.term)]));
  for (const item of acceptedItems) {
    const lemma = normalizeWord(item.lemma);
    const term = normalizeWord(item.term);
    if (mergedWords.has(lemma) || mergedWords.has(term)) continue;
    merged.push({ ...item, entryId: `es-${slug(item.lemma)}-${slug(item.partOfSpeech)}`, frequencyBand: "high" });
    mergedWords.add(lemma);
    mergedWords.add(term);
  }
  if (merged.length < targetWords) {
    console.warn(`[language] topic '${topic.id}': saved ${merged.length}/${targetWords} target words; this topic will use the saved list without replacement calls.`);
  }
  const lexicon: TopicLexicon = {
    schemaVersion: 1,
    topicId: topic.id,
    title: topic.title,
    level: "A2",
    generatedAt: date,
    source: "llm",
    model: getModelTag(),
    promptVersion: 2,
    items: merged,
  };
  atomicWrite(path.join(TOPIC_LEXICONS_DIR, `${topic.id}.json`), `${JSON.stringify(lexicon, null, 2)}\n`);
  console.log(`[language] stored ${lexicon.items.length} A2 words for topic '${topic.title}'.`);
  return lexicon;
}

export async function generateAndStoreLanguageLesson(date: string): Promise<LanguageLesson | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Lesson date must use YYYY-MM-DD.");
  fs.mkdirSync(LESSONS_DIR, { recursive: true });
  const outputPath = path.join(LESSONS_DIR, `${date}.json`);
  const lessons = loadPreviousLessons();
  if (fs.existsSync(outputPath)) {
    const existing = JSON.parse(fs.readFileSync(outputPath, "utf8")) as LanguageLesson;
    buildAndStoreUsedWordIndex([...lessons.filter((lesson) => lesson.createdAt !== date), existing]);
    console.log(`[language] ${outputPath} already exists — preserving today's lesson.`);
    return existing;
  }

  const taxonomy = loadTaxonomy();
  const topics = taxonomy.topics;
  const wordsPerLesson = taxonomy.selectionPolicy.wordsPerLesson;
  const targetWordsPerTopic = taxonomy.selectionPolicy.targetWordsPerTopic;
  const lexicons = loadTopicLexicons();
  const knownCatalogWords = collectUsedWords(lessons, lexicons);
  const learnedWords = collectUsedWords(lessons, []);
  const latestTopicId = lessons.at(-1)?.topicId;
  const latestTopicIndex = topics.findIndex((topic) => topic.id === latestTopicId);
  const startIndex = latestTopicIndex < 0 ? 0 : latestTopicIndex;

  for (const topic of [...topics.slice(startIndex), ...topics.slice(0, startIndex)]) {
    const historicalTopicItems = lessons
      .filter((lesson) => lesson.topicId === topic.id)
      .flatMap((lesson) => lesson.items);
    let lexicon = lexicons.find((candidate) => candidate.topicId === topic.id);
    if (!lexicon) {
      const usedOutsideTopic = new Set(knownCatalogWords);
      for (const item of historicalTopicItems) {
        usedOutsideTopic.delete(normalizeWord(item.lemma));
        usedOutsideTopic.delete(normalizeWord(item.term));
      }
      lexicon = await generateTopicLexicon(date, topic, topics, usedOutsideTopic, historicalTopicItems, targetWordsPerTopic);
    }
    const items = lexicon.items.filter((item) =>
      !learnedWords.has(normalizeWord(item.lemma)) && !learnedWords.has(normalizeWord(item.term))
    ).slice(0, wordsPerLesson);
    if (items.length === 0) continue;

    const lesson: LanguageLesson = {
      schemaVersion: 1,
      lessonId: `es-${date}-${topic.id}`,
      language: "es",
      level: "A2",
      topicId: topic.id,
      title: topic.title,
      newWordCount: items.length,
      createdAt: date,
      source: "topic-lexicon",
      model: lexicon.model,
      promptVersion: 2,
      items,
    };
    atomicWrite(outputPath, `${JSON.stringify(lesson, null, 2)}\n`);
    buildAndStoreUsedWordIndex([...lessons, lesson]);
    console.log(`[language] saved ${items.length} new words from '${topic.title}' to ${outputPath}.`);
    return lesson;
  }

  throw new Error("All configured Spanish A2 topic vocabularies are exhausted. Add another topic to the taxonomy.");
}
