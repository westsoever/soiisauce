---
name: soii-learn
description: Drill something you already hold in the vault until it sticks, using active recall. The owner picks a note, a PDF in the vault, a note that lists links, or a topic; the skill gives a short explanation, asks a question, checks the answer, goes deeper on weak spots, connects concepts across linked notes, and repeats until the owner stops. It uses ONLY content already in the vault - it never fetches URLs or adds outside knowledge; for links only clipped content counts, and for gaps it suggests /soii-explore. At the end it appends a dated line like `- 2026-10-12 (learn) — 7/10; weak on X, Y` to the note's ## Log and commits, so progress shows in soii. Use when the owner says "quiz me on", "help me learn", "drill this", "test me on this note", "study", or types /soii-learn.
---

# soii learn

An active-recall tutor over the owner's own notes. It teaches and tests **only what is already in the vault**. Remembering beats re-reading, so most of the session is the owner answering questions, not you explaining.

Hard rules:
- **Vault content only.** Never fetch a URL, never search the web, never add facts from general knowledge, even when you're sure. If a question needs something the vault lacks, say "your notes don't cover that" and suggest `/soii-explore`.
- A note that lists links counts only for what's **clipped into the vault** (the note's own text, or notes it links to with `[[...]]`). A bare URL is not content. A note saved by `/soii-explore` with a `## Clipped (<date>, from <url>)` section counts: the clipped text, or the PDF it embeds, is vault content. A note with only a summary and a `url` is thin.
- These are the owner's private notes. Show short excerpts, not whole notes. Skip notes marked `soii: hidden` or `publish: false`, and ignore `%%private%%` comments.
- Writes: one dated line in one note's `## Log` at the end, and one commit. Nothing else. Never delete, move or rename notes. Never push.

## 1. Pick the material

Find the vault (current directory; in soii's repo ask whether to use `template/`). Ask what to drill, with AskUserQuestion: **A note**, **A PDF in the vault**, **A collection of links**, **A topic**. If the owner already named it, skip the question.

- **Note:** find it (`find . -iname '*name*.md' -not -path './.*'`), read it. Ask if two match.
- **PDF:** `find . -iname '*.pdf' -not -path './.*'`; read it a section at a time with `Read` and `pages` (up to 20 pages per read). For a long PDF, ask which chapter or pages to start with. The Log line goes on the note that wraps or links the PDF if there is one; else ask where it should go, or skip logging.
- **Collection of links:** a note listing links. Read it, then for each link look for a clipped note in the vault (`grep -rIl --exclude-dir=.soii --exclude-dir=.claude --exclude-dir=.trash --exclude-dir=Templates --include='*.md' '<url or title>' .`, and `[[links]]`). Drill only the clipped ones (a `## Clipped` section or an embedded PDF counts). Tell the owner which links have no content in the vault, in one line, and offer `/soii-explore` for them.
- **Topic:** `grep -rIl -i --exclude-dir=.soii --exclude-dir=.claude --exclude-dir=.trash --exclude-dir=Templates --include='*.md' '<topic>' .`, rank by relevance, show the top five titles, and let the owner pick which to include (default: all of them, capped at about eight).

Keep the `--exclude-dir` flags on every recursive grep: macOS's recursive grep descends into dot folders, so without them it also matches soii's own sample notes and docs in `.soii/`, and the Templates.

If the material is very thin (a title and a link), say so and stop: there's nothing to drill. Suggest `/soii-explore`.

Break the material into **concepts**: 5 to 12 ideas, claims, terms or steps in the owner's own wording. Keep a private list of them with a note of where each came from. Tell the owner how many you found and what the first one is, nothing more.

## 2. The loop

Repeat, one concept at a time. Keep it short: a terminal, not a lecture.

1. **Explain** the concept in two or three sentences, built from the notes' own words. Cite the note: `[[Note title]]`.
2. **Ask** one question that needs recall or reasoning, not a yes/no: "why does X lead to Y?", "what are the three parts of Z?", "what would you do if ...?". Vary the kind: define, explain, apply, compare. Never ask what the notes don't answer.
3. **Wait** for the owner's answer. Don't give hints before they try. "Don't know" is a valid answer: treat it as a miss.
4. **Check** against the note. Say right, partly right, or not yet, and show the line from the note in a short quote. Credit what was right. Score it internally: 1 right, 0.5 partly, 0 miss.
5. **Go deeper on a miss**: re-explain it in a different way (an example from the notes, or a contrast with a related concept), then ask a fresh question on the same concept. Put weak concepts back in the queue to return later in the session.
6. **Connect** every few concepts: ask how two concepts relate, especially across **linked notes** (`[[links]]` and backlinks: `grep -rIl --exclude-dir=.soii --exclude-dir=.claude --exclude-dir=.trash --exclude-dir=Templates '\[\[Note title' .`). Only connections the notes themselves support. If the owner finds a connection the notes don't make, say that's their own idea and offer to note it in the Log line.

Every few questions, give a one-line check-in with AskUserQuestion: **Keep going**, **Harder questions**, **Review what I missed**, **Stop here**. Stop when they choose it, or when they've nailed every concept twice.

## 3. Close and log

Tally: questions asked, score out of the number of questions (round to a whole `n/10`-style fraction using the real count, e.g. `7/10`, or `11/14`), and the concepts that were missed more than once: the weak spots.

Show the owner the summary and the exact line:

```
- 2026-10-12 (learn) — 7/10; weak on X, Y
```

(Today's date from `date +%F`. If nothing was weak: `— 9/10; solid`. Use short concept names, no quotes from the note.) Ask: **Log it** or **Skip**. On **Log it**, append it to the end of the note's `## Log` section (create `## Log` at the end of the note if missing; for a person note the heading is `## Notes & dated interactions`). Match the section's existing line style. For a topic drill over several notes, log the line on the note the owner picks as the main one, or on each if they say so (the line names the topic).

```bash
git add -- "<note path>"
git commit -m "learn: <note title> 7/10" -m "weak on X, Y"
```

Add the commit trailer your environment asks for. Don't push. Not a git repo: log the line, skip the commit, and say so.

## 4. Next

Offer, in one line each: drill the weak spots again later (they'll show in the Log), `/soii-explore` for what the notes didn't cover (name the gaps you hit), or stop.
