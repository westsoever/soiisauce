# soii.

**Your Obsidian vault, as an app.** soii turns the notes you already keep in Obsidian into a calm, visual front end you can open on your laptop or your phone: a library of what you read and watch, the people in your life and when you last talked, your goals, your money, and the daily briefs your agents write. Your notes stay plain Markdown in your own git repo. soii runs on your own computer, reads them, and makes a few small, explicit edits you ask for.

![Today: daily brief and recent notes](docs/screenshots/today.png)

## Quick start

In a terminal, no AI needed:

```bash
curl -fsSL https://raw.githubusercontent.com/westsoever/soiisauce/main/install.sh | bash
```

It checks that git, Bun and GitHub can be reached (and tells you the exact fix if not), asks a few plain questions (a new vault from the starter, or your own notes), installs soii and opens it at http://localhost:5011.

Prefer Claude Code? Clone the repo, run `claude` in it and type **`/soii-setup`**: the same install, as a conversation.

## What you get

| | |
|---|---|
| **Library.** Books, audiobooks, films, documentaries, videos, papers and articles as a shelf with covers, status and ratings. Add a book from soii and it becomes a note in your vault. ![Library](docs/screenshots/library.png) | **People.** Who you know, how you know them, and who you haven't seen in a while, based on how often you want to keep in touch. ![People](docs/screenshots/people.png) |
| **Finance.** Accounts, subscriptions with renewal dates, and expenses by category. ![Finance](docs/screenshots/finance.png) | **Goals.** This year, this life, and the bucket list, as a board. ![Goals](docs/screenshots/goals.png) |
| **Reader.** Any note, nicely typeset, with its properties, backlinks and an "Open in Obsidian" link. ![Reader](docs/screenshots/reader.png) | **Log.** The quick way in: "had coffee with Ana", "finished Dune", "spent 120 kr on books". Each one is a commit to your vault. ![Log](docs/screenshots/log.png) |

It follows your light or dark setting, and in a narrow window it switches to a bottom bar.

<p>
  <img src="docs/screenshots/phone-today.png" width="230" alt="soii on a phone: Today">
  <img src="docs/screenshots/phone-people.png" width="230" alt="soii on a phone: People">
  <img src="docs/screenshots/library-dark.png" width="520" alt="Library in dark mode">
</p>

*All screenshots use the made-up demo vault in [`template/`](template/).*

## How it works

```
your vault (a folder, a git repo) ──watched──▶ soii on localhost:5011 ──▶ your browser
        ▲                                              │
        └─────── Log / Add / edit properties (commits) ┘
```

- **soii lives in your vault.** `soii install` puts its code and build in the vault's `.soii/` folder and a `soii` command on your computer. It runs at `http://localhost:5011`, starts when you log in, and only your computer can reach it. No account, no sign-in, nothing deployed.
- **Your vault stays yours.** Notes are plain Markdown with properties at the top (Obsidian's frontmatter). soii sorts them into workspaces by their `type`, so a note with `type: book` shows up in the Library. Every property is optional.
- **It follows your notes.** Edit in Obsidian, in Claude Code or in soii: the change shows up within a second or two.
- **Writes are commits.** Log, Add and property edits go into your vault files as local git commits. **Sync** pulls, then pushes, and never merges or forces.
- **Your settings live in your vault.** Workspaces, tabs and labels are in `soii.config.yml`; API keys in `.soii/.env.local`. `soii update` moves to a new release without touching either. See [docs/updating.md](docs/updating.md).

## Install

You need a Mac (Linux works as a background process), [Bun](https://bun.sh) and git. About 10 minutes.

```bash
curl -fsSL https://raw.githubusercontent.com/westsoever/soiisauce/main/install.sh | bash
```

That is the whole install: it asks whether the vault is new or yours. To skip the questions, pass them on (`... | bash -s -- init ~/my-vault`, or `... | bash -s -- ~/my-vault --yes` for a vault you have; a new vault starts empty; add `--samples` to `init` to fill it with sample notes). Doing it by hand is in [docs/setup.md](docs/setup.md).

Then `soii open`. From now on `soii status`, `soii update`, `soii logs` and the rest work from anywhere. In Claude Code, run `/soii-intro` in your vault for a tour, and `/soii-setup` if your notes lack properties soii reads. Full guide: [docs/setup.md](docs/setup.md).

**Try it without installing** (a checkout of this repo, with the demo vault):

```bash
bun install
VAULT_PATH=$PWD/template bun run dev   # http://localhost:13390
```

## Skills

soii ships with Claude Code skills for the jobs around it: preparing your vault (`/soii-setup`), a weekly health check that opens a pull request (`/soii-health`), fixing a failed sync (`/soii-sync-fix`), and more. `soii install` and `soii update` copy them into your vault's `.claude/skills/`. The **Skills** page in the sidebar lists every skill in your vault, including ones you make with `/skillfactory`, with the command to type in Claude Code and a copy button. See also the **[skills cheatsheet](docs/skills.md)**.

## Docs

| | |
|---|---|
| [setup.md](docs/setup.md) | Install soii in your vault, step by step |
| [frontmatter.md](docs/frontmatter.md) | Which properties soii reads, per type, and `soii.config.yml` |
| [workspaces.md](docs/workspaces.md) | The workspaces and tabs, and how to change them |
| [briefs.md](docs/briefs.md) | Daily briefs and weekly reviews |
| [skills.md](docs/skills.md) | The Claude Code skills that come with soii |
| [updating.md](docs/updating.md) | Getting new versions of soii |

## Development

```bash
bun install
VAULT_PATH=/path/to/vault bun run dev   # http://localhost:13390
bun test app scripts && bun run typecheck
```

Design: [DESIGN.md](DESIGN.md). What changed in each release: [CHANGELOG.md](CHANGELOG.md). soii is MIT licensed: [LICENSE](LICENSE).
