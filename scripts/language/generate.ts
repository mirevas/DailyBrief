import "../_env";

import { generateAndStoreLanguageLesson } from "../../lib/ai/language-lesson";
import { todayKey } from "../../lib/utils";

const date = process.argv[2] || todayKey();

generateAndStoreLanguageLesson(date).catch((error: unknown) => {
  console.error("[language] FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
