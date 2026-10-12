# Skills cheatsheet

soii comes with Claude Code skills in `.claude/skills/`. Open Claude Code in your vault (or in the soii repo) and type the command, or just describe what you want ("set up my vault for soii") and Claude picks the right one.

| Command | When to use it | What it does | Changes |
|---|---|---|---|
| `/soii-install` | You've just cloned or forked soii | Walks you through [setup.md](setup.md) step by step: Vercel, GitHub sign-in, vault token, redeploy hook, phone icon. Runs the `vercel`/`gh` commands it can. | Your Vercel project and GitHub settings, with your OK at each step |
| `/soii-setup` | Workspaces are empty, your notes have no properties, or you have no vault yet | Starts a new vault from the template, **imports** an existing vault's notes into a soii vault (the old one is never touched), or sets up in place. Proposes which folders are books, people, goals…, then adds every documented property to each typed note on a branch: empty keys, plus values that can be worked out safely (`author` from a `Title — Author` file name, `last_contact` from the newest dated line, `cadence` from the relationship, `created` from git). Adds the tracking sections and templates, and writes `soii.config.yml`. Never guesses a status, rating or amount. | Your vault, on a branch `soii/setup`; you approve the merge |
| `/soii-health` | Weekly, or when something looks off | Runs the vault checker (and the checks in your own `.claude/soii-health.local.md`, report-only), fixes safe frontmatter slips (casing, ISO dates, obvious YAML typos, missing `type` in a typed folder), and reports broken links, unknown types, missing properties, stale Inbox and orphans in a pull request (or an issue, when there was nothing to fix). | Your vault, via a pull request; never pushes to main |
| `/soii-sync-fix` | **Sync** or **Add to vault** showed an error | Reads git's message and fixes the vault repo (stash, rebase, conflicts), asking before anything that changes it. | Your local vault, with your OK |
| `/soii-capture` | You have a thought, quote or link to park | Writes what you said, as you said it, into one new note in the Inbox. No filing, no linking. | One new Inbox note |
| `/soii-save` | After a conversation that produced something worth keeping | Pulls decisions, tasks, new people, insights and ideas out of the conversation and files each in the right place: a decision note, a `- [ ]` in the project's `## Plan`, a person note from your template, a topic note, an Inbox idea. | New notes, and new lines at the end of existing ones; nothing is rewritten |
| `/soii-synthesize` | You want to know what your notes say about a topic | Reads the notes on a topic, time range or folder, finds recurring themes, contradictions and gaps, and writes a synthesis note that links its sources. | One new note, plus one link line in a map or topic note |
| `/soii-panel` | You're unsure about a decision | Convenes three or four perspectives (operator, contrarian, customer, long game…) that each argue alone, then names the tension and recommends. Offers to log the decision with `/soii-save`. | Nothing unless you say yes |
| `/soii-update` | You want the latest soii | Shows what's new, merges the original soii into your fork, runs the tests, pushes so Vercel redeploys. Your vault and settings aren't touched. | Your soii fork |
| `/soii-intro` | You've just installed soii, or want the tour again | A short guided tour in the terminal: what soii is, the areas of **your** vault (top folders and note counts, workspaces, `.soii/`, `Templates/`), the skills available (read live from `.claude/skills/`, grouped by job), and the `soii` commands (`soii status` if it's installed). Checkpoints let you skip or jump to a task, and it ends by suggesting the right next skill, such as `/soii-setup` when notes lack properties. | Nothing, unless you choose a hand-off |
| `/soii-wrap` | End of a working session | Reads the conversation for decisions, tasks, people, ideas and learnings, then shows a plan: dated lines on the related people, project and goal notes, one session line in today's daily note, and new typed notes only when clearly needed. Writes after your yes. | The notes in the plan, one local commit; never pushes (Sync does) |
| `/soii-chat` | You want to know what your notes say about something | Answers **only** from your vault: it searches, reads the relevant notes and cites them as `[[Note title]]`. When the vault doesn't have the answer it says so instead of filling in from general knowledge, and points to `/soii-explore`. Offers to save a good answer to the Inbox. | Nothing, unless you save an answer as a note |
| `/soii-learn` | You want to remember a note, PDF, link collection or topic | An active-recall drill: short explanation, a question, your answer checked against your notes, deeper on weak spots, connections across linked notes, repeat until you stop. Uses only what's in the vault (no fetching, no outside facts; clipped text and PDFs saved by `/soii-explore` count). Appends `- 2026-10-12 (learn) — 7/10; weak on X, Y` to the note's `## Log`. | One `## Log` line and a local commit |
| `/soii-explore` | You want new, good sources on a topic, note or PDF | Web search for niche, high-signal references (papers, essays, talks, small blogs, books, primary sources), each with a one-line why and how it ties to your notes. You pick; each pick becomes a typed note with full properties in the Inbox or the matching Library folder. Choose **Save with text** and an article's readable text, or an openly available PDF, is clipped into the note too (paywalled pages, video, audio and books stay link and summary), so `/soii-learn` can drill it. Never puts your note contents into a search. | New notes for the items you keep, plus downloaded PDFs in your attachments folder; one local commit |
| `/skillfactory` | You have a process you keep repeating, or one that just happened | Turns it into a skill: works out trigger, steps, inputs, outputs and hard rules (from your description or from this session), writes `.claude/skills/<name>/SKILL.md` in the house style, adds a cheatsheet row if the repo has one, and commits. Won't overwrite an existing skill without your yes. | A new skill folder, a cheatsheet row, a local commit |

## Run soii-health every week in the cloud

The weekly check doesn't need your computer on. In Claude Code, run `/schedule` and ask for:

- **Schedule:** weekly (for example Sunday morning)
- **Repos:** your soii fork **and** your vault repo
- **Prompt:** "Run the soii-health skill from the soii repo (`.claude/skills/soii-health/SKILL.md`) against the vault repo checked out next to it. Follow it exactly: fix only the safe items on a branch, report through one pull request or issue on the vault repo, never push to main."

Each week you get a pull request on your vault to review and merge, an issue if there was only something to report, or nothing if the vault is healthy.

## The `soii` command

Controls the soii that runs in your vault (see [setup.md](setup.md)). It serves http://localhost:5011 and starts on boot.

| Command | What it does |
|---|---|
| `soii install [vault]` | Installs soii into a vault: `.soii/`, build, the `soii` command, the skills, and the start-on-boot service. Safe to run again. |
| `soii init <dir>` | Makes a new vault from the template (add `--empty` to leave out the sample notes), then installs soii in it. |
| `soii start` / `stop` / `restart` | Starts, stops or restarts the service. `start` is safe to repeat. |
| `soii status` | Running or not, port, vault, installed version and the newest one. |
| `soii open` | Opens http://localhost:5011. |
| `soii logs [-f]` | Shows the service log; `-f` follows it. |
| `soii update` | Moves to the newest release, rebuilds, refreshes the skills, restarts, and shows what changed. |
| `soii check` | Runs the vault checker on your vault. |
| `soii uninstall` | Removes the service and the `soii` command. Never touches your notes or `.soii/`. |

## Your own checks in `soii-health`

`/soii-health` checks what soii can read. Checks that only make sense for your vault go in `.claude/soii-health.local.md`, at the vault root. If the file exists, `/soii-health` runs everything it describes too and puts the results under **This vault's checks** in the same report. They are report-only: `/soii-health` never edits notes because of them.

Write it as plain instructions, one check per bullet, for example:

```markdown
# My vault's health checks

- **Stale projects:** projects with `status: active` and no dated line in `## Log` for 30 days.
- **Contradictions:** read `CRITICAL_FACTS.md`; flag notes that state a different fact (job, city, goal). Don't quote the facts file.
- **Inbox:** more than 15 notes in `00-Inbox/`.
- **Maps:** every note in `Resources/Books/` is linked from `Maps/Books.md`.
```

## Scripts

Plain commands, no Claude needed. In a vault, they live in `.soii/soii/scripts/`; in the soii repo, in `scripts/`.

| Command | What it does |
|---|---|
| `bun scripts/check-vault.ts <vault>` | Lists every note soii can't read properly, and which documented properties typed notes lack. Read-only. `--json` for machines. |
| `bun scripts/vault-normalise.ts <vault> [--write]` | Adds the documented properties to every typed note, empty or filled from what can be worked out safely. A dry run unless `--write`. `--type Reading/=book` types a folder, `--only <folder/>` limits it, `--sections` adds the empty tracking heading. Never overwrites a value. |
| `bun scripts/vault-import.ts <old vault> <new vault>` | Copies an existing vault's notes into a soii vault. Never overwrites, never touches the old vault. `--dry-run` first. |
| `bun scripts/fill-book-meta.ts --limit 50 --commit` | Looks up missing book covers, authors and ISBNs once and writes them into the notes. See [setup.md](setup.md). |
| `bun scripts/find-base64-notes.ts <vault>` | Finds notes that were saved base64-encoded by mistake. |
