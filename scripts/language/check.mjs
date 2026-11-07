import fs from "node:fs";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const topics = readJson("data/language/topics/taxonomy.json");
const schema = readJson("data/language/schema/daily-lesson.schema.json");
const fail = (message) => { throw new Error(message); };

if (topics.language !== "es" || topics.level !== "A2") fail("Topic taxonomy must describe Spanish A2 lessons.");
if (!Array.isArray(topics.topics) || topics.topics.length === 0) fail("At least one lesson topic is required.");
if (new Set(topics.topics.map((topic) => topic.id)).size !== topics.topics.length) fail("Topic IDs must be unique.");
if (!Number.isInteger(topics.selectionPolicy?.wordsPerLesson) || topics.selectionPolicy.wordsPerLesson < 1) fail("wordsPerLesson must be a positive integer.");
if (!Number.isInteger(topics.selectionPolicy?.targetWordsPerTopic) || topics.selectionPolicy.targetWordsPerTopic < 1) fail("targetWordsPerTopic must be a positive integer.");
if (!schema.required?.includes("items") || schema.properties?.language?.const !== "es") fail("Daily lesson schema is incomplete or not Spanish-specific.");

console.log(`[language:check] OK: ${topics.topics.length} Spanish A2 topics and lesson schema.`);
