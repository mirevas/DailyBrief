import fs from "node:fs";
import path from "node:path";
import { jsonrepair } from "jsonrepair";
import { extractJson } from "./json-util";
import { runLlm, getModelTag } from "./llm";

type Topic = { id: string; title: string; order: number; description: string };
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
export type LanguageLesson = {
  schemaVersion: 1;
  lessonId: string;
  language: "es";
  level: "A1";
  topicId: string;
  title: string;
  newWordCount: number;
  createdAt: string;
  source: "llm";
  model: string;
  promptVersion: 1;
  items: LessonWord[];
};

const TOPICS_PATH = "data/language/topics/taxonomy.json";
const LESSONS_DIR = "daily_reports/language/lessons";
const USED_WORDS_PATH = "daily_reports/language/used-words.json";
const WORDS_PER_LESSON = 10;
const MAX_ATTEMPTS = 2;

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

function loadTopics(): Topic[] {
  const data = JSON.parse(fs.readFileSync(TOPICS_PATH, "utf8")) as {
    topics: Topic[];
  };
  return [...data.topics].sort((a, b) => a.order - b.order);
}

function loadPreviousLessons(): LanguageLesson[] {
  if (!fs.existsSync(LESSONS_DIR)) return [];
  return fs.readdirSync(LESSONS_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(LESSONS_DIR, name), "utf8")) as LanguageLesson);
}

function addLessonWords(index: Map<string, Set<string>>, lesson: LanguageLesson): void {
  for (const item of lesson.items ?? []) {
    for (const value of [item.lemma, item.term]) {
      const normalized = normalizeWord(value ?? "");
      if (!normalized) continue;
      const topicIds = index.get(normalized) ?? new Set<string>();
      topicIds.add(lesson.topicId);
      index.set(normalized, topicIds);
    }
  }
}

function buildAndStoreUsedWordIndex(lessons: LanguageLesson[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const lesson of lessons) addLessonWords(index, lesson);

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
): { topicId: string; items: Array<Omit<LessonWord, "entryId" | "frequencyBand">> } {
  if (!value || typeof value !== "object") throw new Error("Expected a JSON object.");
  const result = value as Record<string, unknown>;
  const topicId = result.topicId;
  const topic = topics.find((candidate) => candidate.id === topicId);
  if (!topic) throw new Error(`Unknown topic: ${String(topicId)}`);
  if (!Array.isArray(result.items) || result.items.length !== WORDS_PER_LESSON) {
    throw new Error(`Expected exactly ${WORDS_PER_LESSON} new words.`);
  }

  const seen = new Set<string>();
  const items = result.items.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`Word ${index + 1} is not an object.`);
    const item = raw as Record<string, unknown>;
    const lemma = typeof item.lemma === "string" ? item.lemma.trim() : "";
    const term = typeof item.term === "string" ? item.term.trim() : "";
    const normalizedLemma = normalizeWord(lemma);
    const normalizedTerm = normalizeWord(term);
    if (!lemma || !term || !normalizedLemma) throw new Error(`Word ${index + 1} is missing lemma or term.`);
    if (seen.has(normalizedLemma) || seen.has(normalizedTerm) || usedWords.has(normalizedLemma) || usedWords.has(normalizedTerm)) {
      throw new Error(`Repeated word: ${lemma}`);
    }
    seen.add(normalizedLemma);
    seen.add(normalizedTerm);

    const entryType = item.entryType;
    const partOfSpeech = item.partOfSpeech;
    const translation = item.translation as Record<string, unknown> | undefined;
    const example = item.example as Record<string, unknown> | undefined;
    if (entryType !== "word" && entryType !== "phrase") throw new Error(`Invalid entryType for ${lemma}.`);
    if (typeof partOfSpeech !== "string" || !partOfSpeech.trim()) throw new Error(`Missing part of speech for ${lemma}.`);
    if (typeof translation?.en !== "string" || !translation.en.trim() || typeof translation.zh !== "string" || !translation.zh.trim()) {
      throw new Error(`Missing English/Chinese translation for ${lemma}.`);
    }
    if (typeof example?.es !== "string" || !example.es.trim() || typeof example.en !== "string" || !example.en.trim() || typeof example.zh !== "string" || !example.zh.trim()) {
      throw new Error(`Missing Spanish/English/Chinese example for ${lemma}.`);
    }

    const posSlug = slug(partOfSpeech);
    return {
      entryId: `es-${slug(lemma)}-${posSlug}`,
      lemma,
      term,
      entryType,
      partOfSpeech: partOfSpeech.trim(),
      ...(typeof item.gender === "string" && item.gender.trim() ? { gender: item.gender.trim() } : {}),
      frequencyBand: "high" as const,
      translation: { en: translation.en.trim(), zh: translation.zh.trim() },
      ...(typeof item.pronunciation === "string" && item.pronunciation.trim() ? { pronunciation: item.pronunciation.trim() } : {}),
      example: { es: example.es.trim(), en: example.en.trim(), zh: example.zh.trim() },
    };
  });
  return { topicId, items };
}

function atomicWrite(filePath: string, contents: string): void {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, contents, "utf8");
  fs.renameSync(tempPath, filePath);
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

  const topics = loadTopics();
  const usedWordIndex = buildAndStoreUsedWordIndex(lessons);
  const usedWords = new Set(usedWordIndex.keys());
  const latestTopicId = lessons.at(-1)?.topicId;
  const currentTopicId = latestTopicId;
  const currentTopic = topics.find((topic) => topic.id === currentTopicId);
  // Only send exclusions for the topic being continued. The local validator
  // still checks every topic, so cross-topic repeats cannot be stored.
  const topicUsedList = [...usedWordIndex.entries()]
    .filter(([, topicIds]) => topicIds.has(currentTopicId ?? ""))
    .map(([word]) => word)
    .sort();
  const topicList = topics.map((topic) => `${topic.id}: ${topic.description}`).join("\n");
  const systemPrompt = [
    "You are an experienced Spanish teacher creating a short A1 vocabulary lesson for a beginner.",
    "Choose useful, genuinely common Spanish words or short expressions, all within exactly one topic.",
    "Do not reuse a word or expression in the excluded list. Prefer canonical singular nouns and infinitive verbs as lemmas.",
    "Provide natural Spanish examples and accurate English and Simplified Chinese translations.",
    "Return only one valid JSON object, with no markdown or extra text.",
  ].join(" ");

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const retryHint = lastError ? `\n\nPrevious response was rejected: ${lastError instanceof Error ? lastError.message : String(lastError)}. Return a corrected lesson.` : "";
    const userPrompt = [
      `Create exactly ${WORDS_PER_LESSON} new Spanish A1 vocabulary items for the lesson dated ${date}.`,
      "",
      "Available topics (choose one topicId only):",
      topicList,
      "",
      currentTopic
        ? `Topic continuity: continue with '${currentTopic.id}' if you can provide 10 useful, high-frequency A1 items. Excluded words below cover this topic only. If you must choose another topic, still choose one that fits all 10 items.`
        : "Start with the first suitable topic in the listed order.",
      "Every item must be within the one chosen topic. Frequency should reflect common beginner usage; avoid rare, technical, regional-only, or overly specific vocabulary.",
      currentTopic
        ? `Do not include any normalized lemma or term from this topic's excluded list (${currentTopic.id}):`
        : "Do not repeat items within the lesson.",
      JSON.stringify(topicUsedList),
      "",
      "Return JSON matching this shape:",
      '{"topicId":"people","items":[{"lemma":"persona","term":"la persona","entryType":"word","partOfSpeech":"noun","gender":"feminine","translation":{"en":"person","zh":"人"},"pronunciation":"/peɾˈsona/","example":{"es":"...","en":"...","zh":"..."}}]}',
      "Use entryType 'word' or 'phrase'. Include gender only when relevant. Pronunciation may be omitted if uncertain. Exactly 10 items are required.",
      retryHint,
    ].join("\n");

    try {
      const { text } = await runLlm({ systemPrompt, userPrompt });
      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJson(text));
      } catch {
        parsed = JSON.parse(jsonrepair(extractJson(text)));
      }
      const validated = validateResponse(parsed, topics, usedWords);
      const topic = topics.find((candidate) => candidate.id === validated.topicId)!;
      const lesson: LanguageLesson = {
        schemaVersion: 1,
        lessonId: `es-${date}-${topic.id}`,
        language: "es",
        level: "A1",
        topicId: topic.id,
        title: topic.title,
        newWordCount: validated.items.length,
        createdAt: date,
        source: "llm",
        model: getModelTag(),
        promptVersion: 1,
        items: validated.items,
      };
      atomicWrite(outputPath, `${JSON.stringify(lesson, null, 2)}\n`);
      buildAndStoreUsedWordIndex([...lessons, lesson]);
      console.log(`[language] saved ${lesson.items.length} new words for '${lesson.title}' to ${outputPath}.`);
      return lesson;
    } catch (error) {
      lastError = error;
      console.warn(`[language] generation attempt ${attempt}/${MAX_ATTEMPTS} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
