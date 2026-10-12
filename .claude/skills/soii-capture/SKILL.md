---
name: soii-capture
description: Zero-friction capture. Drops whatever the owner just said into the vault's Inbox as a new note, with no filing, linking or tidying. Use when they say "capture this", "note this down", "remember this idea", or hand you a thought, quote or link to park for later.
---

# Capture

The fastest way in. One note in the Inbox, exactly what was said. Classifying, linking and typing come later, on the owner's terms.

## Where the Inbox is

The vault's Inbox folder: `00-Inbox/` in soii's template. If the vault has no such folder, look for the folder that holds unfiled notes (a note tagged `inbox` is a hint, so is a folder called Inbox or Unsorted). Still unsure: ask once. Never create a new top-level folder.

## What to do

Take what the user gave you and write one note:

File: `<Inbox>/YYYY-MM-DD-<slug>.md`, today's date and a short lowercase slug from the first few words. If that name exists, add `-2`, `-3`. Never overwrite.

```markdown
---
created: YYYY-MM-DD
tags:
  - inbox
---

# <Title: the first words, as a person would write them>

<The content as given. Don't interpret, restructure or summarise. A pasted link stays a bare link.>
```

If what they gave you is clearly an idea ("what if we…", "idea:"), add `idea` to the tags. Nothing else.

Reply with one line: `Captured → <Inbox>/<filename>`.

## Rules

- No type, no properties beyond the two above, no `[[links]]`, no questions. The owner types and files it later (`/soii-save`, or by hand in Obsidian).
- Quote the user's words faithfully, including typos. This is their note, not yours.
- Don't file it anywhere but the Inbox unless they say where.
