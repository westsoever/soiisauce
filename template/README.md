# soii starter vault

An Obsidian vault for a made-up person, Sam Rivera, a product designer in Copenhagen. Everyone and everything in it is invented, apart from the public books, films, talks and papers. It fills every soii workspace, so you can try soii without your own notes. It is also the starter vault: `soii init <dir>` copies it.

## Try it

From the soii repo:

```bash
VAULT_PATH=$PWD/template SOII_DEV_AUTH=1 PORT=13391 bun run dev
```

Open http://localhost:13391.

## Use it as your own vault

1. `soii init <dir>` copies this folder to a new vault (add `--empty` to leave out Sam's notes) and installs soii in its `.soii/` folder. Or copy the folder by hand.
2. Open the folder in Obsidian. Templates and daily notes are already pointed at `Templates/` and `01-Daily/`.
3. Make it a **private** git repo. soii commits its edits to the vault locally and `Sync` pulls and pushes.
4. Already have a vault? Run `/soii-setup` in Claude Code from inside this one and point it at your old vault; it copies the notes in and fills in their properties.

`.soii/` holds the pinned soii install (`package.json`, `.gitignore`). It is not a note folder and soii never indexes it.

## Layout

| Folder | What goes there | soii workspace |
|---|---|---|
| `00-Inbox/` | Quick notes | Projects → Inbox |
| `01-Daily/` | Daily notes, `type: daily` | Today → Journal |
| `02-Projects/` | `type: project` with a `status` | Projects → Board |
| `03-Areas/Goals/` | `type: goal` | Goals |
| `03-Areas/Finance/` | `account`, `subscription`, `expense` | Finance |
| `04-Resources/Library/` | books, audiobooks, films, videos, papers, articles | Library |
| `05-Knowledge/People/` | `type: person` | People |
| `05-Knowledge/Topics/` | Evergreen notes | Projects → Knowledge |
| `06-Wiki/daily_report/` | Briefs, `type: daily-brief` | Today → Daily brief |
| `06-Wiki/week_report/` | `type: weekly-review` | Today → Weekly review |
| `Attachments/` | Images. Covers are referenced as `cover: "[[name.svg]]"` | |
| `Templates/` | One template per type. soii never reads this folder | |

soii's Log and Add write new notes into the same folders. Every frontmatter field soii understands is listed in `docs/frontmatter.md` in the soii repo.
