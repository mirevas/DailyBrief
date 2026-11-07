# DailyBrief Learn — A2 topic vocabulary

## Behavior

- Spanish vocabulary is generated at A2 level and grouped by the topic taxonomy.
- When a topic has no saved lexicon, one LLM call generates up to 40 high-frequency, useful A2 entries, ordered by practical frequency. Repeated entries are skipped and the unique entries from that response are saved before any are scheduled into a dated report; no replacement calls are made.
- Each daily report receives the next 10 not-yet-listed entries from the current topic lexicon. The final batch may contain fewer than 10. Once all entries in that topic have appeared in dated lessons, generation advances to the next topic.
- The taxonomy order determines the topic sequence. When all configured topic lexicons are exhausted, generation reports exhaustion; add a topic to continue.
- Hola! has two top-level views: dates and topics. Each date lists the words shown in that day's report; each topic lists every word in its saved lexicon.
- Existing dated lessons are retained. If a topic has historical lessons but no lexicon, those entries are carried into its lexicon before the new A2 entries.
- Chinese meanings remain in lesson data while the page's Chinese display flag is off.

## Artifacts

- `data/language/topics/taxonomy.json`: language level, topic order, and topic descriptions. Topic headings are based on Goethe-Verlag's English-to-Spanish vocabulary category index; generated word entries remain original and are not copied from its lists.
- `data/language/schema/daily-lesson.schema.json`: dated lesson contract.
- `npm run language:check`: validates the topic taxonomy and lesson schema.
- `npm run language:generate [YYYY-MM-DD]`: generate and store a dated lesson without running the news pipeline.
- `daily_reports/language/topics/<topic-id>.json`: persisted topic lexicons, retained on the published `gh-pages` branch.
- `daily_reports/language/lessons/YYYY-MM-DD.json`: dated lesson snapshots.
- `daily_reports/language/used-words.json`: derived index rebuilt from dated lesson snapshots.
- `npm run build-site`: emits the archive, index, and Hola! date/topic vocabulary views.

The topic vocabulary list is a finite generated catalog sized by `selectionPolicy.targetWordsPerTopic` (up to 40 entries per topic by default). Adjust that value or add narrower topics in the taxonomy to change the scope. The LLM is called once when each topic catalog is first created.
