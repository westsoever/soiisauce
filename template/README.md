# Your soii vault

This is an [Obsidian](https://obsidian.md) vault with **soii** on top of it.

**soii** is a calm, visual app for the notes you already keep. It reads this vault and shows it as a library of what you read and watch, the people in your life and when you last talked, your goals, your daily notes and weekly reviews. It runs on your own computer, at http://localhost:5011, and only you can open it. Nothing is uploaded and there is no account. Your notes stay plain Markdown files that Obsidian (and Claude Code) can edit as before; soii follows them.

The notes in here belong to a made-up person, Sam Rivera, a product designer in Copenhagen. Everyone and everything in them is invented, apart from the public books, films, talks and papers. They fill every part of soii so you can see it working. Delete them whenever you like.

## Get started

You need a Mac (Linux works too), [Bun](https://bun.sh) and git. About 10 minutes.

```bash
curl -fsSL https://raw.githubusercontent.com/westsoever/soiisauce/main/install.sh | bash
```

It asks whether to make a new vault from this starter or install soii into one you have. To skip the questions: `... | bash -s -- init ~/my-vault` (it starts empty; add `--samples` to bring Sam's notes), or `... | bash -s -- ~/my-vault --yes` for a vault you already have.

Then `soii open`. From now on `soii status`, `soii update`, `soii logs` and the rest work from anywhere. soii starts when you log in.

Open the vault in Obsidian (Open folder as vault) and, in a terminal in the vault, start Claude Code and type **`/soii-intro`** for a short tour.

### Already have a vault?

Run **`/soii-setup`** in Claude Code from inside your new vault and point it at the old one. It copies your notes in (the old vault is never touched), asks which folders are books, people and so on, and fills in the properties soii reads, on a branch you approve.

## Day to day

1. **Open soii** (`soii open`) next to Obsidian. Write in Obsidian as you always do; the change shows up in soii within a second or two.
2. **Browse the workspaces** in the sidebar: *Today* (daily brief and weekly review), *Library* (books, films, videos, papers), *People* (who you haven't seen in a while), *Finance*, *Goals*, *Projects*. A note lands in a workspace by its `type` property. Click any note to read it, with its properties and backlinks, and an *Open in Obsidian* button.
3. **Log** is the quick way in: "had coffee with Ana", "finished Dune", "spent 120 kr on books". Each one adds a dated line to the right note (or creates it) and is saved as a commit in this vault.
4. **Add** creates a note, such as a book with its cover, from a form.
5. **Edit properties** in a note's side panel: status, rating, dates, how often you want to see someone.
6. **Sync** pulls changes from the vault's remote and pushes yours, if you gave the vault one. It never merges or forces. Without a remote everything simply stays on your computer.

### The skills

soii comes with Claude Code skills, installed in `.claude/skills/` of this vault. Type one in Claude Code, or just say what you want ("wrap up this session", "quiz me on that note"). The **Skills** page in soii's sidebar lists every skill in your vault, with when to use it and a button to copy the command.

| Skill | What it does |
|---|---|
| `/soii-intro` | A short tour of soii and of this vault. Run it once. |
| `/soii-setup` | Brings an existing vault in, or fills in missing properties, on a branch you approve. |
| `/soii-wrap` | End of a working session: files decisions, tasks and ideas, and updates the related notes. |
| `/soii-chat` | A conversation with your vault: ask, or float an idea and see how your notes agree or push back. Local notes only. |
| `/soii-learn` | Quizzes you on your own notes until they stick, and brings back what you got wrong. |
| `/soii-explore` | Finds new, good reading on a topic on the web, and saves what you choose into the vault. |
| `/soii-health` | A weekly check-up: notes soii can't read, broken links, a full Inbox. Fixes the safe things on a branch. |

There are more: `/soii-capture`, `/unbox` (files everything in your Inbox where it belongs), `/soii-save`, `/soii-synthesize`, `/soii-panel`, `/soii-sync-fix`, and `/skillfactory` to turn something you keep doing into a skill of your own. Everything is listed in the [skills cheatsheet](https://github.com/westsoever/soiisauce/blob/main/docs/skills.md) and in the Skills page.

## Layout

| Folder | What goes there | soii workspace |
|---|---|---|
| `00-Inbox/` | Quick notes | Projects → Inbox |
| `01-Daily/` | Daily notes, `type: daily`, named `YYYY-MM-DD` | Today → Journal |
| `02-Projects/` | `type: project` with a `status` | Projects → Board |
| `03-Areas/Goals/` | `type: goal` | Goals |
| `03-Areas/Finance/` | `account`, `subscription`, `expense` | Finance |
| `04-Resources/Library/` | books, audiobooks, films, videos, papers, articles | Library |
| `04-Resources/Library/Recipes/` | `type: recipe` with an `image` and a `description` | Library → Recipes |
| `04-Resources/Library/Journal/` | Video log transcripts, `type: video-log` | Library → Journal |
| `05-Knowledge/People/` | `type: person` | People |
| `05-Knowledge/Topics/` | Evergreen notes | Projects → Knowledge |
| `06-Wiki/daily_report/` | Briefs, `type: daily-brief` | Today → Daily brief |
| `06-Wiki/week_report/` | `type: weekly-review` | Today → Weekly review |
| `Attachments/` | Images and PDFs. Covers are referenced as `cover: "[[name.svg]]"` | |
| `Templates/` | One template per type, with the full set of properties. soii never reads this folder | |

Obsidian's templates and daily notes already point at `Templates/` and `01-Daily/`. soii's Log and Add write new notes into the same folders. Every property soii understands is listed in `.soii/soii/docs/frontmatter.md`.

`.soii/` holds soii itself (the code, a build and the version it is pinned to). It isn't a note folder and soii never indexes it. Keep this vault a **private** git repo: your notes are in it.

## Keeping soii up to date

`soii update` moves to the newest release, rebuilds, refreshes the skills in `.claude/skills/`, and shows what changed. Your notes, `soii.config.yml` and keys are not touched.
