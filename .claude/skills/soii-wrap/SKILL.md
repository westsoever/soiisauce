---
name: soii-wrap
description: End-of-session wrap-up for a vault. Reads the current conversation and pulls out decisions, tasks, people met or mentioned, ideas and learnings, then shows a plan and, after a yes, updates the related notes - dated lines under the tracking headings on people, projects and goals, a session line in today's daily note, and new fully typed notes only when clearly warranted - and commits in the vault without pushing. Use at the end of a working session, when the owner says "wrap up", "wrap this session", "log this session" or "update my notes from this", or types /soii-wrap. For a lighter mid-session capture use /soii-save.
---

# soii wrap

Closes a working session by putting what happened into the notes it belongs to. Works from **this conversation**, not from plan files (there are none). It proposes, the owner approves, then it writes and commits.

Hard rules:
- These are the owner's private notes. In the plan, show paths and one-line excerpts only.
- **Plan first, write after a yes.** No exceptions, even for "just a daily note line".
- Never delete, move or rename notes. Never overwrite a value: append, or add a missing key.
- Commit in the vault. **Never push**: soii's Sync button pushes. Never `push --force` or `reset --hard`.
- Don't invent. If the conversation doesn't say it, it doesn't go in a note. If a name could match two notes, ask.

## 1. Find the vault

The vault is the current directory (it has `.obsidian/` or `soii.config.yml`; in the soii repo use `template/` only if the owner says so). Then:

```bash
git status -sb          # note what's already uncommitted, so you don't commit the owner's unrelated edits
ls
cat .obsidian/daily-notes.json 2>/dev/null     # daily folder and date format
ls Templates 2>/dev/null
```

Daily notes live in the `folder` from `daily-notes.json`, else `01-Daily/`, named `YYYY-MM-DD.md` unless `format` says otherwise. If the vault isn't a git repo, still do the work but say that nothing can be committed.

## 2. Extract from the conversation

Go through the session and list, each with a one-line source ("we agreed X"):

| Signal | Goes to |
|---|---|
| **Decision** (what was chosen and why) | the project or area note it belongs to, as a dated line; a standalone note only if it's big and has no home |
| **Task or commitment** (who, what, when) | the project note's checklist (`- [ ]`), or a dated line |
| **Person** met, mentioned with news, or promised something | their note, under `## Notes & dated interactions`; also bump `last_contact` if the conversation was with them |
| **Goal progress** | the goal note's `## Log`, and `progress:` only if a number was stated |
| **Idea** not ready to act on | a new note in the Inbox (`00-Inbox/`) |
| **Learning** (a fact, a method, something that worked) | a dated line on the related project, book, article or topic note; a new note only if nothing fits |
| **Session itself** | one line in today's daily note |

Skip small talk, dead ends, and anything private-looking the owner didn't mean to record (credentials, tokens, other people's secrets). Never write tokens or passwords into a note.

## 3. Match to existing notes

Don't guess paths. Search:

```bash
find . -iname '*<name>*.md' -not -path './.*' | head
grep -rIl --exclude-dir=.soii --exclude-dir=.claude --exclude-dir=.trash --exclude-dir=Templates --include='*.md' -i '<project or person>' . 2>/dev/null | grep -v '^\./\.' | head
```

Read the matching note's frontmatter and its tracking section before planning an edit. The conventions (from `docs/frontmatter.md`):
- Most notes: `## Log`, with lines `- YYYY-MM-DD (kind) — text`. Kinds: `note`, `decision`, `task`, `idea`, `learn`, `read`, `watch`, `session`.
- People: `## Notes & dated interactions`, with lines `- YYYY-MM-DD: text` (follow the style already in that note).
- If the section is missing, the plan says "add `## Log` at the end".

## 4. Show the plan, get a yes

Print a compact plan:

```
Wrap plan (5 changes)
  EDIT  02-Projects/Portfolio redesign.md  + "- 2026-10-12 (decision) — Going with a single-page layout"
  EDIT  05-Knowledge/People/Elena Rivera.md + dated line, last_contact -> 2026-10-12
  EDIT  01-Daily/2026-10-12.md  + "- Session: portfolio layout, intro to Elena"
  NEW   00-Inbox/Idea - gallery filters.md  (type: article? no -> plain note)
  SKIP  "Anders" — two matches, which one?
```

Then ask with AskUserQuestion: **Apply all**, **Let me edit the list**, **Cancel**. Resolve any SKIP items by asking. Nothing is written until **Apply all**.

## 5. Apply

- **Appending a line:** add it at the end of the right section, leave everything else byte-for-byte. Dates are today's, ISO (`date +%F`).
- **Daily note:** if today's note doesn't exist, create it from `Templates/Daily note.md` (replace `{{date}}`), else a minimal one with `type: daily` and `date:`. Add one session line under an `## Evening` or `## Log` heading if there is one, else at the end: `- Session: <what moved, in one line>`.
- **New notes** only when clearly warranted: no existing note fits, and it's a person, goal, project, idea or reference worth keeping. Start from `Templates/<Type>.md` if it exists, else use the fields in `docs/frontmatter.md` ("Fields per type"). Write **every documented key** for the type, empty where unknown; never guess a status, rating or amount. Dates `YYYY-MM-DD`. Put it in the Inbox unless the type has an obvious home (`05-Knowledge/People/`, `04-Resources/Library/<Kind>/`). Add a `## Log` (or the people heading) with the first dated line.
- Never write into a note marked `soii: hidden` or `publish: false`: skip it and say so.

## 6. Commit

Stage **only the files you touched**, by name:

```bash
git add -- <each path>
git commit -m "wrap: <short summary of the session>" -m "<one line per changed note>"
```

Add the commit trailer your environment asks for. Don't push. Say: "Committed locally. soii's Sync button (or `git push`) sends it."

If unrelated changes were already uncommitted, leave them alone and say how many files you didn't touch.

## 7. Report

Under 10 lines: notes edited, notes created, anything skipped and why, the commit hash. Offer `/soii-learn` if the session produced something worth drilling, otherwise stop.
