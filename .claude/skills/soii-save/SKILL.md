---
name: soii-save
description: Extracts decisions, tasks, new people, insights and ideas from the current conversation and files each where it belongs in the vault, using soii's note conventions. The light, mid-session save. Use when the owner says "save this", "file what we decided", or after a conversation that produced something worth keeping.
---

# Save what came out of this conversation

Scan the conversation so far. Pull out what is worth keeping, file each piece in the right place, and say what you did. Add to the vault; never rewrite what's in it.

## Orient first

soii's template has these folders; use the vault's own if it differs (check where existing typed notes live, `soii.config.yml`, and `.obsidian/daily-notes.json`):

| What | Where (template) |
|---|---|
| Inbox | `00-Inbox/` |
| Projects | `02-Projects/` (`type: project`, with `## Plan` and `## Log`) |
| People | `05-Knowledge/People/` (`type: person`) |
| Topics, evergreen notes | `05-Knowledge/Topics/` |
| Templates | `Templates/` |

Never create a new top-level folder. Property names and values are in `docs/frontmatter.md` (in a vault: `.soii/soii/docs/frontmatter.md`).

## What to extract, and where it goes

| Signal | Destination |
|---|---|
| A decision was made | A decision note: in the vault's decisions folder if it has one (a folder called `decisions`), else in the Inbox. Format below. |
| A task or commitment | A `- [ ]` line under `## Plan` in the matching project note. No project fits: ask which, or leave it out and say so. |
| A new person (someone not already in the vault) | A person note from `Templates/Person.md` (copy its properties, fill only what was said, leave the rest as empty keys). Ask for `relationship` if it isn't clear; never guess it. |
| An insight or something learned | The matching topic note as a dated bullet, or a new short topic note if there is none. |
| An idea not ready to act on | An Inbox note, `idea-<slug>.md`, tagged `inbox` and `idea` (the same shape `/soii-capture` writes). |

Look before you write: search the vault for the person, project or topic so you add to the existing note, not a duplicate.

## Decision note

```markdown
---
type: decision
date: YYYY-MM-DD
status: decided
---

# Decision: <title>

## Context
Why this came up.

## Decision
What was decided.

## Rationale
Why this over the alternatives.
```

`status` is `decided`, `reversed` or `pending`, as the conversation says. soii shows `type: decision` as a plain note until a workspace lists it; mention that once, and offer to add a Decisions tab to `soii.config.yml` if there are several.

## After filing

- If the vault keeps a running `log.md` or an `index.md` at its root, add a one-line entry for what you filed (and index a significant new note). If it doesn't, don't create them.
- Reply with a short list: each thing filed and its path. Then ask whether anything needs developing further.

## Rules

- Add only: a new note, or a new line at the end of the right section. Never edit or delete existing text, never rename or move a note.
- Fill in only what was said. No guessed statuses, ratings, dates or relationships.
- New notes get the full property set for their type (empty keys for the unknown); `/soii-setup` explains why.
- Dated lines are `- YYYY-MM-DD: text`, the form soii reads.
- These are private notes. Show paths and short descriptions, not the notes' contents, when you report.
