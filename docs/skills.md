# Skills cheatsheet

soii comes with Claude Code skills in `.claude/skills/`. Open Claude Code in your vault (or in the soii repo) and type the command, or just describe what you want ("set up my vault for soii") and Claude picks the right one.

| Command | When to use it | What it does | Changes |
|---|---|---|---|
| `/soii-setup` | Workspaces are empty, your notes have no properties, or you have no vault yet | Starts a new vault from the template, **imports** an existing vault's notes into a soii vault (the old one is never touched), or sets up in place. Proposes which folders are books, people, goals…, then adds every documented property to each typed note on a branch: empty keys, plus values that can be worked out safely (`author` from a `Title — Author` file name, `last_contact` from the newest dated line, `cadence` from the relationship, `created` from git). Adds the tracking sections and templates, and writes `soii.config.yml`. Never guesses a status, rating or amount. | Your vault, on a branch `soii/setup`; you approve the merge |
| `/soii-health` | Weekly, or when something looks off | Runs the vault checker (and the checks in your own `.claude/soii-health.local.md`, report-only), fixes safe frontmatter slips, fills the documented properties on notes added or changed since its last run (old gaps are only counted) (casing, ISO dates, obvious YAML typos, missing `type` in a typed folder), and reports broken links, unknown types, missing properties, stale Inbox and orphans in a pull request (or an issue, when there was nothing to fix). | Your vault, via a pull request; never pushes to main |
| `/soii-sync-fix` | **Sync** or **Add to vault** showed an error | Reads git's message and fixes the vault repo (stash, rebase, conflicts), asking before anything that changes it. | Your local vault, with your OK |
| `/soii-capture` | You have a thought, quote or link to park | Writes what you said, as you said it, into one new note in the Inbox. No filing, no linking. | One new Inbox note |
| `/soii-save` | After a conversation that produced something worth keeping | Pulls decisions, tasks, new people, insights and ideas out of the conversation and files each in the right place: a decision note, a `- [ ]` in the project's `## Plan`, a person note from your template, a topic note, an Inbox idea. | New notes, and new lines at the end of existing ones; nothing is rewritten |
| `/soii-synthesize` | You want to know what your notes say about a topic | Reads the notes on a topic, time range or folder, finds recurring themes, contradictions and gaps, and writes a synthesis note that links its sources. | One new note, plus one link line in a map or topic note |
| `/soii-panel` | You're unsure about a decision | Convenes three or four perspectives (operator, contrarian, customer, long game…) that each argue alone, then names the tension and recommends. Offers to log the decision with `/soii-save`. | Nothing unless you say yes |
| `/soii-intro` | You've just installed soii, or want the tour again | A short guided tour in the terminal: what soii is, the areas of **your** vault (top folders and note counts, workspaces, `.soii/`, `Templates/`), the skills available (read live from `.claude/skills/`, grouped by job), and the `soii` commands (`soii status` if it's installed). Checkpoints let you skip or jump to a task, and it ends by suggesting the right next skill, such as `/soii-setup` when notes lack properties. | Nothing, unless you choose a hand-off |
| `/soii-wrap` | End of a working session | Reads the conversation for decisions, tasks, people, ideas and learnings, then shows a plan: dated lines on the related people, project and goal notes, one session line in today's daily note, and new typed notes only when clearly needed. Writes after your yes. | The notes in the plan, one local commit; never pushes (Sync does) |
| `/soii-chat` | You want to think with your notes, or ask them something | A back-and-forth conversation in the terminal that stays going until you say "done". Each turn it searches your vault and answers conversationally with `[[citations]]`, often asking something back or pointing at a related note. Float an idea and it tells you where your notes agree, push back or connect. It remembers the conversation. Strictly your local notes: when they don't cover something it says so and keeps chatting. At the end it offers a short summary and to save the conversation as an Inbox note. | Nothing, unless you save the conversation as a note |
| `/soii-learn` | You want to remember what's in your notes, or don't know what to review | An active-recall drill that works on its own: **pick for me** (brings back what you scored lowest or haven't reviewed longest, read from your earlier `(learn)` Log lines), a note, a topic across the whole vault, or a PDF in the vault. It builds the session from the note and its surroundings (linked notes, backlinks, same tags or folder, daily notes that mention it), asks, checks your answer against your notes, goes deeper on weak spots, repeats until you stop. Vault only, never the web. Appends `- 2026-10-12 (learn) — 7/10; weak on X, Y` to the note's `## Log`. | One line in a note's `## Log`, one local commit |
| `/soii-explore` | You want new, good sources on a topic, note or PDF | Web search for niche, high-signal references (papers, essays, talks, small blogs, books, primary sources), each with a one-line why and how it ties to your notes. You pick; each pick becomes a typed note with full properties in the Inbox or the matching Library folder. Choose **Save with text** and an article's readable text, or an openly available PDF, is clipped into the note too (paywalled pages, video, audio and books stay link and summary), so `/soii-learn` can drill it. Never puts your note contents into a search. | New notes for the items you keep, plus downloaded PDFs in your attachments folder; one local commit |
| `/skillfactory` | You have a process you keep repeating, or one that just happened | Turns it into a skill: works out trigger, steps, inputs, outputs and hard rules (from your description or from this session), writes `.claude/skills/<name>/SKILL.md` in the house style, adds a cheatsheet row if the repo has one, and commits. Won't overwrite an existing skill without your yes. | A new skill folder, a cheatsheet row, a local commit |
| `/soii-view` | You want a new tab, or to change which notes a tab shows (filter) or their order (sort) | Turns a description into a view, using the types, fields and values in your vault. Previews the notes, suggests an existing tab when one already shows mostly the same notes, answers one-off questions without adding a tab, and saves only after you say so. Can also re-filter, re-sort or remove a tab. | `soii.config.yml`, one local commit per change |
| `/soii-release` | **Maintainers only, not in your vault.** You maintain soii and want to cut a release | Walks you through [releasing.md](releasing.md) step by step: checks `main` is clean and green, picks the version, bumps `package.json`, tags, publishes the GitHub release with the new `DECISIONS.md` entries as notes, and verifies by updating your own vault. Asks for a clear yes before pushing `main`, pushing the tag and publishing. Lives only in the soii repo; `soii install` and `soii update` don't copy it. | The soii repo and its tags, after each yes |

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
| `soii install` | In a terminal with no vault named (also `soii setup`, which always asks): the **install wizard**, for people who don't use Claude. It checks Bun, git and GitHub access, then asks new or existing vault, where it goes and what it's called, whether to start soii at login and open it, and (for existing notes) whether to fill in missing properties and give folders a type. It shows a recap and waits for one final yes. See [setup.md](setup.md#set-up-without-ai). |
| `soii install [vault]` | Installs soii into a vault: `.soii/`, build, the `soii` command, the skills (committed in your vault), and the start-on-boot service. Safe to run again. `--no-service` (or `SOII_NO_SERVICE=1`) installs into the vault only: no service, no `soii` command, nothing outside the vault, so a test or a second vault can't disturb your real install. Run it with `bun <vault>/.soii/soii/bin/soii.ts …`. |
| `soii init <dir>` | Makes a new vault from the template (add `--empty` to leave out the sample notes, `--title <name>` to set the title in `soii.config.yml`; it defaults to the folder name), then installs soii in it. Takes `--no-service` like `install`. |
| `soii start` / `stop` / `restart` | Starts, stops or restarts the service. `start` is safe to repeat. |
| `soii status` | Running or not, port, vault, installed version and the newest one. |
| `soii open` | Opens http://localhost:5011. |
| `soii logs [-f]` | Shows the service log; `-f` follows it. |
| `soii update` | Moves to the newest release, rebuilds, refreshes the skills, restarts, and shows what changed. `--no-service` updates the vault only and leaves the service alone. |
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
| `bun scripts/vault-normalise.ts <vault> [--write]` | Adds the documented properties to every typed note, empty or filled from what can be worked out safely. A dry run unless `--write`. `--type Reading/=book` types a folder, `--only <folder/>` limits it, `--sections` adds the empty tracking heading, `--files-from <file>` limits it to the notes listed there (what the weekly `/soii-health` uses for notes added or changed since its last run). Never overwrites a value. |
| `bun scripts/vault-import.ts <old vault> <new vault>` | Copies an existing vault's notes into a soii vault. Never overwrites, never touches the old vault. `--dry-run` first. |
| `bun scripts/release-notes.ts <previous tag> <new tag>` | Maintainers only. The `DECISIONS.md` entries added between two tags, as release notes with the compare link. Run in the soii repo; see [releasing.md](releasing.md). |
| `bun scripts/fill-book-meta.ts --limit 50 --commit` | Looks up missing book covers, authors and ISBNs once and writes them into the notes. See [setup.md](setup.md). |
| `bun scripts/find-base64-notes.ts <vault>` | Finds notes that were saved base64-encoded by mistake. |
