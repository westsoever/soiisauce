---
name: soii-chat
description: Chat with your vault. Answers ONLY from the notes in this vault - it searches with grep and glob, reads the relevant notes, and cites them as [[Note title]]. When the vault doesn't contain the answer it says so plainly and does not fill in from general knowledge (it suggests /soii-explore to go find sources instead). It can offer to save a good answer as a new note in the Inbox. Use when the owner asks "what do my notes say about X", "what do I know about", "did I write anything on", "find what I noted on", "ask my vault", or types /soii-chat. Not for questions about the world in general.
---

# soii chat

A conversation with the owner's notes. The rule that defines this skill: **every claim in an answer comes from a note in this vault, and carries a citation.** No outside knowledge, no "generally speaking", no guessing to be helpful.

Hard rules:
- These are the owner's private notes. Quote minimal excerpts (a sentence, not a page) and give the path. Never dump a whole note.
- Answer **only** from vault content. If you know the answer from general knowledge but the vault doesn't, you still say the vault doesn't have it.
- Skip notes whose properties say `soii: hidden` or `publish: false`, text inside `%%...%%` and `<!-- ... -->` comments (private notes-to-self), and folders in `exclude:` of `soii.config.yml`, unless the owner names them.
- Read-only, except saving an answer as a note, which needs a yes (step 5). Never delete, move or rename notes. Never push.

## 1. Where is the vault

The vault is the current directory (`.obsidian/` or `soii.config.yml` is there). In soii's own repo there is no vault: ask whether to use `template/`, the sample vault. If the vault isn't found, say so and stop.

Read `soii.config.yml` once if it exists, for `exclude:`.

## 2. Understand the question

If the question is vague ("what about the project?"), ask one clarifying question. Otherwise pull out two or three search terms: the main words, close spellings and plurals, and names (people, titles). Don't expand with synonyms from your own knowledge beyond obvious ones the notes might use.

## 3. Search the vault

Use grep and glob (the shell or your search tools), not memory:

```bash
# titles and file names first
find . -iname '*term*.md' -not -path './.*' -not -path './node_modules/*'
# then contents, files only
grep -rIl -i --include='*.md' 'term' . | grep -v '^\./\.' | head -40
# properties: which notes are a given type, status or tag
grep -rIl -E '^type: *book' --include='*.md' .
```

Rank the hits: file name and heading matches first, then notes with several hits, then single mentions. Read the best five to ten notes (frontmatter plus body), and follow `[[links]]` one hop when a note clearly continues elsewhere. For a PDF in the vault, read the relevant pages only (`Read` with `pages`). Dated `## Log` lines are good evidence for "when" and "what happened"; use them.

If there are more than about 40 hits, say so and narrow with the owner instead of skimming.

## 4. Answer

- Lead with the answer in a few sentences, or a short list for "what do I have on X".
- **Cite every claim**: `[[Note title]]` right after it, using the note's title (file name without `.md`). Two claims from two notes get two citations. Add the path when two notes share a title.
- Quote a short excerpt only when the exact wording matters. Mark it as a quote, with the note.
- Give dates when the notes do (`from a Log line on 2026-08-14`). Say when notes disagree, and cite both.
- Distinguish what a note says from what you infer: "The notes don't say why, but [[A]] and [[B]] were both written the same week."

**When the vault doesn't have it**, say it plainly, in the first sentence:

> Your vault doesn't say. I searched for "X" and "Y" and found nothing relevant (closest: [[Z]], which is about something else).

Then stop answering the question. Don't add a general-knowledge paragraph, not even a short one. Offer: "`/soii-explore` can look for good sources on this and put them in your Inbox." If the vault has only part of the answer, give that part, cite it, and say what's missing.

## 5. Keep going, and offer to save

Stay in the conversation: follow-up questions search again (don't rely on earlier hits if the topic moved). After a substantial answer, offer once: "Want this saved as a note in the Inbox?" (AskUserQuestion: **Save it**, **Not now**.) Don't offer for one-line lookups.

On **Save it**:
- Create `00-Inbox/<Descriptive title>.md` (use the vault's inbox folder if it names one differently; never overwrite: if the name exists, add a number).
- Frontmatter: just `tags: [chat-answer]` and `created: <today>` (a plain note has no soii type). Only if the answer is clearly a reference article, use `type: article` with the full properties from `docs/frontmatter.md`.
- Body: the question as a heading, the answer with its `[[citations]]` intact, and a `## Sources` list of the notes used.
- Show the path, and commit it only if the owner asks. Don't push.

## 6. Report

Nothing to report at the end of a chat, but if you saved a note, print its path.
