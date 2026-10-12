---
name: soii-synthesize
description: Finds patterns across notes that were never linked and writes a synthesis note. Recurring themes, contradictions, gaps and convergences, with the sources listed as links. Use when the owner asks what their notes say about a topic, wants connections across a time range or folder, or asks to "synthesize" something.
---

# Synthesize

Find the connections nobody wrote down, and keep the evidence next to the claim.

## 1. Scope

What topic, time range or folder? Ask once if it isn't clear from the request. A synthesis over the whole vault is rarely useful; narrow it.

## 2. Gather

Search the vault for the topic, by words, tags, `type` or folder. Leave out `.obsidian/`, `.claude/`, `.soii/`, `Templates/`, anything excluded in `soii.config.yml`, and notes marked `soii: hidden` or `publish: false` (the owner keeps those out of soii on purpose). Read every note that matches. If there are more than about 30, show the owner the list and let them narrow it before you read on.

## 3. Find patterns

Look for:

- **Recurring themes** across notes that don't link to each other.
- **Contradictions** between notes, especially across time. Keep both sides.
- **Gaps:** things implied but never stated.
- **Convergence:** three or more notes pointing at the same underlying idea.

Two notes are an anecdote. Say how many notes support each claim.

## 4. Write the synthesis

A new note. Put it in the vault's concepts or wiki folder if it has one (for example `06-Wiki/concepts/`), else beside the topic notes (`05-Knowledge/Topics/`). Name it `<slug>.md`, never overwriting.

```markdown
---
synthesized: YYYY-MM-DD
tags:
  - synthesis
sources:
  - "[[note one]]"
  - "[[note two]]"
  - "[[note three]]"
---

# <Pattern name>

## What this is
The question this synthesis answers.

## The pattern
The core insight in 2–3 sentences.

## Evidence
- [[note one]]: what it contributes
- [[note two]]: what it contributes

## Contradictions
Where the sources disagree. Keep them; don't flatten them.

## What this implies
An action, or the next question.
```

Quote the `sources` links (`"[[…]]"`): an unquoted `[[x]]` in YAML is a list inside a list, and soii can't read the properties.

## 5. Link it in

Add a line linking the new note to the most relevant map or topic note (a map is a note that lists notes on a subject, often in `07-Maps/`), as a new last bullet. If the vault keeps an `index.md`, add it there too. Don't create either.

Reply with the path, the one-sentence pattern, and which links you added.

## Rules

- Add only. Existing notes get at most one new link line.
- Report paths and the pattern, not long quotes from private notes.
- Say plainly when the notes don't hold a pattern. An empty synthesis is a fine answer.
