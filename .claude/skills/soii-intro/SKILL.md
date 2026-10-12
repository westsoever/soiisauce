---
name: soii-intro
description: A short guided tour of soii in the terminal, run once after install. Explains what soii is, shows the areas of this vault (top folders with note counts, soii.config.yml workspaces, .soii/, Templates/), lists the available skills grouped by job (read live from .claude/skills, so it is never out of date), and the `soii` CLI commands, with checkpoints to skip or jump to something. Ends by handing off to the right skill, for example /soii-setup when notes lack properties. Use when the owner says "show me around", "what can soii do", "I just installed soii", "intro", or types /soii-intro.
---

# soii intro

A five-step tour of soii and this vault, in the terminal. Read-only until the owner picks a hand-off. Keep every step to a few lines: this is a terminal, not a manual.

Use the **AskUserQuestion** tool at each checkpoint, with these options: **Next**, **Skip the rest of the tour**, and **I want to do something now** (then ask what, and hand off to the matching skill from step 6). If AskUserQuestion isn't available, ask in plain text with the same three choices.

Hard rules: these are the owner's private notes. Show folder names, counts and paths, never note contents. Change nothing during the tour. Never delete, move or rename notes.

## 0. Find the vault and soii

The vault is the current directory. Check it looks like one:

```bash
ls -a | head -40
test -d .obsidian && echo "obsidian vault"
test -d .soii && echo "soii installed here"
```

- **In a vault** (`.soii/` exists): soii's scripts are at `.soii/soii/scripts/`. Set `SOII=.soii/soii`.
- **In the soii repo itself** (there's `scripts/check-vault.ts` and no `.soii/`): `SOII=.`, and the demo vault is `template/`. Say so, and tour `template/` as the sample vault.
- **Neither:** say "this doesn't look like a soii vault" and suggest `soii install <vault>` or `soii init <dir>`. Stop.

## 1. What soii is (3 lines, then checkpoint)

Say, in your own words:
- soii is a visual front end for this Obsidian vault. It reads your notes and shows them as a library, people, goals, a daily feed. It runs on your computer (usually at http://localhost:5011; `soii status` shows the port) and never uploads your notes.
- Your notes stay plain Markdown files. Obsidian still edits them; soii mostly reads, and only its **Log**, **Add** and property-edit buttons write: one line, one note or one property, each as a local commit.
- Claude Code (what you're talking to now) does the thinking work through skills that live in this vault.

## 2. Your vault (read it, don't recite it)

Count what's really there:

```bash
for d in */; do printf "%s\t%s notes\n" "$d" "$(find "$d" -name '*.md' -not -path '*/.*' | wc -l | tr -d ' ')"; done
find . -maxdepth 1 -name '*.md' | wc -l       # loose notes at the root
```

Skip dot-folders and `node_modules`. Show a short table: folder, notes, and a guess at its job when the name makes it obvious (`00-Inbox` is where new things land, `01-Daily` is the daily notes, `03-Areas`, `04-Resources/Library` holds books, articles, videos and research, `05-Knowledge/People`, `06-Wiki`). Don't invent jobs for folders you don't recognise: say "yours".

Then, only for what exists:
- `soii.config.yml`: read its `title`, `home` and the workspace `id`/`title` list (`grep -nE '^(title|home):|^  - id:|^    title:' soii.config.yml`). Explain a workspace as "a section in soii's sidebar, built from notes with a matching `type`".
- `.soii/`: "soii's own folder: the code, logs and the version pin. Don't edit it. It isn't part of your notes."
- `Templates/`: list the file names. "Obsidian's New-from-template uses these; the skills use them too, so new notes get the same properties."
- `.obsidian/daily-notes.json`: the daily folder, if set.

One-line health summary, so step 6 can hand off:

```bash
bun "$SOII/scripts/check-vault.ts" . | tail -15
```

Report only the counts (errors, warnings, and the "missing properties" total if shown). If it doesn't run (no Bun, say), say you couldn't run the checker and move on.

Checkpoint.

## 3. The skills available here

Read them live, never from memory:

```bash
for f in .claude/skills/*/SKILL.md; do
  n=$(basename "$(dirname "$f")")
  d=$(sed -n '/^description:/{s/^description: *//;p;q;}' "$f")
  printf "/%s\t%s\n" "$n" "$d"
done
```

Group them by job and print each as `/name: <first sentence of its description, shortened>`. Group by what the skill does, using these headings (drop empty ones; put anything unrecognised under "Other"):

- **Set up and keep tidy:** `soii-setup`, `soii-health`, `soii-sync-fix`, `soii-install`
- **Capture:** `soii-capture`, `soii-save`, `soii-wrap`
- **Thinking:** `soii-synthesize`, `soii-panel`, `soii-chat`
- **Learning:** `soii-learn`, `soii-explore`
- **Make your own:** `skillfactory`

Mention that you can also just describe what you want ("save this conversation", "quiz me on that note") and Claude picks the skill. If the folder list differs from the groups above, trust the folder list.

Checkpoint.

## 4. The `soii` command

Check whether it's on PATH and what it says:

```bash
command -v soii && soii status
```

If it runs, show its output in one or two lines (running or not, port, version, newest version). If soii isn't running, offer `soii start`. If `soii` isn't on PATH, say so and suggest `soii install` (or restarting the terminal).

Then the commands, one line each:

| Command | Does |
|---|---|
| `soii open` | open http://localhost:5011 |
| `soii start` / `stop` / `restart` | control the background service |
| `soii status` | running or not, version, newest version |
| `soii logs [-f]` | show or follow the log |
| `soii check` | list notes soii can't read properly (in the vault soii serves) |
| `soii update` | move to the newest release and refresh these skills. It is the one way to update; when a newer release exists, soii shows an **Update available** line under Sync and `soii status` says so |
| `soii init <dir>` / `soii install [vault]` | new vault from the template / install into a vault |

Checkpoint.

## 5. Where things go (optional, offer it)

Ask first: "Want the 30-second version of how notes work?" If yes:
- A note's `type` (book, person, goal, article, video, research…) decides which soii workspace shows it. Full list: `docs/frontmatter.md` in the soii repo, or the `Templates/` folder here.
- The **Log** button adds a dated line, `- 2026-10-12 (read) — text`, under `## Log` (people use `## Notes & dated interactions`). Skills that track progress write the same lines.
- `soii: hidden` in a note's properties keeps it out of soii completely.

## 6. Hand off

Offer the next step with AskUserQuestion. Put the recommended one first, based on what you found:

- Many notes lack properties, or the checker shows errors: **/soii-setup** ("add the missing properties on a branch you approve").
- Empty Inbox and a fresh vault: **/soii-capture** or **/soii-save** to put the first notes in.
- Nothing wrong: **/soii-chat** ("ask your vault a question") or **/soii-explore** ("find new reading on a topic you care about").
- **Nothing for now.**

When they choose, tell them to type the command, or if they ask you to, invoke it. Close with one line: "Run `/soii-intro` any time to see this again."
