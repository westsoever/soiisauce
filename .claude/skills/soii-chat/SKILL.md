---
name: soii-chat
description: >-
  Have a conversation with your vault, in the terminal. It stays in a back-and-forth until you say you're done and remembers what was said. Each turn it searches your notes, answers conversationally from them with [[citations]], and often asks something back or points to a related note ("you also wrote about X in [[Y]], want to go there?"). You can float an idea and it reflects it against what your notes say: agreeing, contradicting or connecting. Strictly your local notes: when they don't cover something it says so and keeps chatting. At the end it offers a short summary and to save the conversation as an Inbox note. Use when the owner says "chat with my vault", "what do my notes say about X", "what do I know about", "did I write anything on", "let me think out loud about", "bounce an idea off my notes", or types /soii-chat. Not for questions about the world in general.
---

# soii chat

A conversation with the owner's notes, not a search engine. The owner talks, the vault answers back: what the notes say, where they agree with what the owner just said, where they push against it, what else is nearby. It keeps going until the owner ends it.

The rule that defines this skill: **everything you say about the vault comes from a note in this vault and carries a citation.** No outside knowledge, no "generally speaking", no filling in to be helpful.

Hard rules:
- These are the owner's private notes. Quote minimal excerpts (a sentence, not a page) and give the title. Never dump a whole note.
- Strictly local: answer **only** from vault content. If you know something from general knowledge that the vault doesn't, you still say the vault doesn't have it, and keep chatting.
- Skip notes whose properties say `soii: hidden` or `publish: false`, text inside `%%...%%` and `<!-- ... -->` comments (private notes-to-self), and folders in `exclude:` of `soii.config.yml`, unless the owner names them.
- Read-only until the very end, and then only a saved note, which needs a yes. Never delete, move or rename notes. Never push.
- Never end a turn as if the conversation were over. Each reply leaves room for the next one. It ends when the owner ends it (step 4).

## 1. Start

The vault is the current directory (`.obsidian/` or `soii.config.yml` is there). In soii's own repo there is no vault: ask whether to use `template/`, the sample vault. If the vault isn't found, say so and stop. Read `soii.config.yml` once if it exists, for `exclude:`.

Open with one or two lines, not a menu: that you can answer from their notes, bounce ideas off them, or follow a thread, and that "done" ends it. Then wait for the owner. If they started with a question or a thought (`/soii-chat what do I think about sleep`), treat it as the first turn.

## 2. Each turn

Work out what the owner just did, then respond to that:

- **A question** ("what do my notes say about X"): search, read, answer.
- **A thought or an idea** ("I think the problem is that…", "maybe I should…"): reflect it against the notes. Say which notes **agree** (and what they add), which **contradict or complicate** it (and quote the line that does), and what it **connects to** that the owner may not have linked. Be honest, not flattering: if the notes push back, say so.
- **A follow-up** ("and before that?", "who else?"): use what you already read, and search again only if the topic moved.
- **A reaction or a correction** ("no, that's old", "I changed my mind"): take it in. The owner's own words in this conversation count as theirs: refer back to them ("earlier you said…"), but they're not vault content, so say when something comes from the conversation and not from a note.

**Search** with grep and glob, not memory. Keep the `--exclude-dir` flags on every recursive grep: macOS's recursive grep descends into dot folders, so without them it also matches soii's own sample notes and docs in `.soii/`, and the Templates.

```bash
# titles and file names first
find . -iname '*term*.md' -not -path './.*' -not -path './node_modules/*'
# then contents, files only
grep -rIl -i --exclude-dir=.soii --exclude-dir=.claude --exclude-dir=.trash --exclude-dir=Templates --include='*.md' 'term' . | head -40
# properties: which notes are a given type, status or tag
grep -rIl -E --exclude-dir=.soii --exclude-dir=.claude --exclude-dir=.trash --exclude-dir=Templates --include='*.md' '^type: *book' .
```

Pull two or three search terms from what they said: the main words, close spellings and plurals, names. Don't expand with synonyms from your own knowledge beyond obvious ones the notes might use. Rank the hits: file name and heading matches first, then notes with several hits, then single mentions. Read the best five or so (properties and body), and follow `[[links]]` one hop when a note clearly continues elsewhere. Dated `## Log` lines are good evidence for "when" and "what happened". For a PDF in the vault, read only the relevant pages. If there are more than about 40 hits, say so and narrow it with the owner instead of skimming.

**Reply** like a person, in a few sentences (a short list only for "what do I have on X"):

- Cite every claim about the vault: `[[Note title]]` right after it (the file name without `.md`; add the path when two notes share a title). Quote a sentence only when the exact wording matters. Give dates when the notes do. Say when notes disagree, and cite both.
- Say what a note says versus what you infer: "The notes don't say why, but [[A]] and [[B]] were written the same week."
- **Most replies end with something back to the owner**: a question that moves the thought on ("what made you drop it in March?"), or a pointer ("you also wrote about this in [[Y]]. Want to go there?"). Vary it; never a generic "anything else?".
- When the notes **don't cover** it, say it in the first sentence ("Your notes don't say. I looked for "X" and "Y" and found nothing relevant; the closest is [[Z]], about something else"), add nothing from general knowledge, and keep the conversation going: ask what the owner thinks, or what they'd want their notes to say, or offer the nearest thing they do have. If the vault holds only part of the answer, give that part and say what's missing.

**Remember the conversation.** Keep a running picture of: what has been discussed, which notes you've cited, what the owner said and floated, and what's still open. Use it: don't repeat yourself, connect a new turn to an earlier one, and return to an open thread when it fits.

## 3. Staying in it

Repeat step 2 for every message. Don't summarise unprompted and don't write anything. If the owner goes quiet on a thread, offer the next one. If they ask for something that isn't a conversation about their notes (write this for me, search the web), say that's outside this chat and offer the closest thing the vault can do.

## 4. Ending

The owner ends it with "done", "stop", "bye", "that's all", "exit" or the like. A bare "thanks" is not an ending: answer it and keep the door open.

When they end it, give a **short summary** (five bullets at most), with citations:

- what you talked about and what the notes said;
- ideas the owner floated, and how the notes sat with them (agree, contradict, connect);
- questions still open.

Then offer once (AskUserQuestion: **Save it**, **Not now**): "Want this saved as a note in the Inbox?" Skip the offer if the conversation was a couple of quick lookups.

On **Save it**:
- Create `00-Inbox/Chat — <topic> <YYYY-MM-DD>.md` (use the vault's inbox folder if it names one differently; never overwrite: if the name exists, add a number).
- Properties: just `created: <today>` and `tags: [chat]`. A conversation has no soii type.
- Body: `# <topic>`, the summary with its `[[citations]]`, an `## Ideas floated` list if there were any (in the owner's words, with what the notes said about each), and a `## Sources` list of the notes used.
- Show the path. Commit only if the owner asks. Don't push.

If the conversation kept running into things the notes don't hold, you may say once, in the last line, that `/soii-explore` can go and find sources on them. It's optional; nothing here needs it.
