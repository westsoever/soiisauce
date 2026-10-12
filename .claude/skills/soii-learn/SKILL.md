---
name: soii-learn
description: Learn what you already keep in your vault, with active recall. Works on its own, with nothing else installed or run first. Pick a note, a topic, a PDF in the vault, or let it pick for you from your earlier drills; it builds the session from the note and everything around it (linked notes, backlinks, same tags or folder, daily notes that mention it), explains a little, asks you a question, checks your answer against your notes, goes deeper on weak spots, and repeats until you stop. At the end it appends a dated line like `- 2026-10-12 (learn) — 7/10; weak on X, Y` to the note's ## Log and commits, so progress shows in soii and the next "pick for me" knows what to bring back. Vault content only, never the web. Use when the owner says "quiz me on", "help me learn", "drill this", "test me on this note", "what should I review", "study", or types /soii-learn.
---

# soii learn

An active-recall tutor over the owner's own notes. It teaches and tests **only what is already in the vault**, and it needs nothing else: no other skill has to have run first. Remembering beats re-reading, so most of the session is the owner answering questions, not you explaining.

Hard rules:
- **Vault content only.** Never fetch a URL, never search the web, never add facts from general knowledge, even when you're sure. If a question needs something the notes lack, say "your notes don't cover that", put it on a short list of gaps, and carry on with what they do cover.
- A bare URL is not content. A note counts for what it contains: its text, a `## Clipped (<date>, from <url>)` section, a PDF it embeds, and the notes around it (step 1).
- These are the owner's private notes. Show short excerpts, not whole notes. Skip notes marked `soii: hidden` or `publish: false`, and ignore `%%private%%` comments.
- Writes: one dated line in one note's `## Log` at the end, and one commit. Nothing else. Never delete, move or rename notes. Never push.

## 1. Pick the material

Find the vault (current directory; in soii's repo ask whether to use `template/`). Ask what to work on, with AskUserQuestion: **Pick for me** (recommended), **A note**, **A topic**, **A PDF in the vault**. If the owner already named something, skip the question.

Keep the `--exclude-dir` flags on every recursive grep below: macOS's recursive grep descends into dot folders, so without them it also matches soii's own sample notes and docs in `.soii/`, and the Templates.

### Pick for me

Spaced review from the Log, with no extra storage. The earlier sessions left lines like `- 2026-10-12 (learn) — 7/10; weak on X, Y`. Read them:

```bash
grep -rIn --exclude-dir=.soii --exclude-dir=.claude --exclude-dir=.trash --exclude-dir=Templates --include='*.md' '(learn)' .
```

For each note, take its **latest** `(learn)` line and rank the notes:

1. the lowest score first (7/10 comes before 9/10), notes with a "weak on …" list ahead of those marked "solid";
2. then the longest since that line's date.

Offer the top three with the reason ("6/10 on 2026-09-30, weak on X, Y"), plus **Something new**. A score of 9/10 or better, drilled within the last week or two, isn't due: leave it out.

**Something new**, and the answer when no `(learn)` lines exist yet: notes added recently that have never been drilled. List the newest notes (`git log --since=30.days --diff-filter=A --name-only --format= -- '*.md'`, or the newest by modification time when that's empty), skip daily notes, Templates, anything under `.claude/`, and notes that already have a `(learn)` line, and offer three. Pick the ones with real text to learn from.

If the vault has no notes with text to learn from, say so in one line and stop.

### A note

Find it (`find . -iname '*name*.md' -not -path './.*'`) and read it. Ask if two match.

### A topic

Gather **every** note on it across the vault, not just one:

```bash
grep -rIl -i --exclude-dir=.soii --exclude-dir=.claude --exclude-dir=.trash --exclude-dir=Templates --include='*.md' '<topic>' .
```

Add notes whose file name, headings or `tags`/`type` match, and notes linked from the best hits. Rank by relevance, show the titles you found (up to about twelve, and how many more there are), and let the owner trim the list. The default is all of them, capped at about twelve. Drill the **concepts** of the topic across them: where notes agree, add to each other or disagree is the best material.

### A PDF in the vault

`find . -iname '*.pdf' -not -path './.*'`. Read it a section at a time with `Read` and `pages` (up to 20 pages per read). For a long PDF, ask which chapter or pages to start with. The Log line goes on the note that wraps or links the PDF if there is one; else ask where it should go, or skip logging.

### A note that lists links

Read it, then for each link look for notes in the vault that hold it (`grep -rIl --exclude-dir=.soii --exclude-dir=.claude --exclude-dir=.trash --exclude-dir=Templates --include='*.md' '<url or title>' .`, and `[[links]]`). Drill what the list note itself says about each link and any note or clipped text behind it. A link with nothing behind it is not content: mention in one line how many had none, and move on.

### Build the session from the surroundings

A note rarely stands alone, and a thin one is not a dead end. Around the chosen note, collect:

- the notes it links to (`[[…]]`, one hop);
- the notes that link to it: `grep -rIl --exclude-dir=.soii --exclude-dir=.claude --exclude-dir=.trash --exclude-dir=Templates --include='*.md' '\[\[Note title' .` (this also catches `[[Note title|alias]]` and `[[Note title#heading]]`);
- notes with the same tag, or in the same folder (siblings), when they're about the same thing;
- the daily notes that mention it (the `YYYY-MM-DD.md` files, and dated lines in `## Log` sections).

Take the closest ones, about eight notes at most, and tell the owner in one line what you pulled in ("`[[A]]` plus 3 notes that link to it and 2 daily notes"). Only when the note **and** its surroundings together hold nothing to learn from (a title and a link, nothing links to it, no tags or siblings that relate) say so in one line, and offer to pick something else. Don't stop the skill over thin material while there's context to use.

### Concepts

Break the material into **concepts**: 5 to 12 ideas, claims, terms or steps in the owner's own wording. Keep a private list of them with a note of where each came from. Tell the owner how many you found and what the first one is, nothing more.

## 2. The loop

Repeat, one concept at a time. Keep it short: a terminal, not a lecture.

1. **Explain** the concept in two or three sentences, built from the notes' own words. Cite the note: `[[Note title]]`.
2. **Ask** one question that needs recall or reasoning, not a yes/no: "why does X lead to Y?", "what are the three parts of Z?", "what would you do if ...?". Vary the kind: define, explain, apply, compare. Never ask what the notes don't answer.
3. **Wait** for the owner's answer. Don't give hints before they try. "Don't know" is a valid answer: treat it as a miss.
4. **Check** against the note. Say right, partly right, or not yet, and show the line from the note in a short quote. Credit what was right. Score it internally: 1 right, 0.5 partly, 0 miss.
5. **Go deeper on a miss**: re-explain it in a different way (an example from the notes, or a contrast with a related concept), then ask a fresh question on the same concept. Put weak concepts back in the queue to return later in the session.
6. **Connect** every few concepts: ask how two concepts relate, especially across linked notes. Only connections the notes themselves support. If the owner finds a connection the notes don't make, say that's their own idea and offer to note it in the Log line.

Every few questions, give a one-line check-in with AskUserQuestion: **Keep going**, **Harder questions**, **Review what I missed**, **Stop here**. Stop when they choose it, or when they've nailed every concept twice.

## 3. Close and log

Tally: questions asked, score out of the number of questions (round to a whole `n/10`-style fraction using the real count, e.g. `7/10`, or `11/14`), and the concepts that were missed more than once: the weak spots.

Show the owner the summary and the exact line:

```
- 2026-10-12 (learn) — 7/10; weak on X, Y
```

(Today's date from `date +%F`. If nothing was weak: `— 9/10; solid`. Use short concept names, no quotes from the note. Keep exactly this shape: `Pick for me` reads these lines to decide what to bring back.) Ask: **Log it** or **Skip**. On **Log it**, append it to the end of the note's `## Log` section (create `## Log` at the end of the note if missing; for a person note the heading is `## Notes & dated interactions`). Match the section's existing line style. For a topic drill or a session over several notes, log the line on the note the owner picks as the main one, or on each if they say so (the line names the topic).

```bash
git add -- "<note path>"
git commit -m "learn: <note title> 7/10" -m "weak on X, Y"
```

Add the commit trailer your environment asks for. Don't push. Not a git repo: log the line, skip the commit, and say so.

## 4. Next

Offer, in one line each: drill the weak spots again later (**Pick for me** will bring them back), pick another note or topic, or stop. If the session hit real gaps, you may add **once**, as an aside, that `/soii-explore` can go looking for new material on them. It's optional and never needed to use this skill.
