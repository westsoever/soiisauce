# Set up soii

soii runs **on your own computer**, inside your vault, at `http://localhost:5011`. It starts when you log in, restarts if it stops, and never leaves your machine. There is no sign-in, because nothing but your computer can reach it. Allow about 10 minutes.

**You need:** a Mac (Linux works too, as a background process), [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`), git, and access to the private `westsoever/soii` repo from the command line (step 1).

## 1. Let git read the soii repo (once)

soii is released as git tags on a private GitHub repo, and git fetches it with your GitHub login.

```bash
gh auth login           # if you aren't signed in to GitHub yet
gh auth setup-git       # lets git use that login
```

## 2. Get the `soii` command

Clone soii once, only to run its installer. The installer puts everything in your vault, so you can delete this clone afterwards.

```bash
git clone --depth 1 https://github.com/westsoever/soii.git ~/soii-installer
```

## 3a. New to soii: make a vault from the starter

```bash
bun ~/soii-installer/bin/soii.ts init ~/my-vault           # with sample notes, to look around
bun ~/soii-installer/bin/soii.ts init ~/my-vault --empty   # or empty, with the structure and templates
```

The vault's title in `soii.config.yml` is the folder's name; `--title "Ana's notes"` sets another.

This copies the starter vault, makes it a git repository with a first commit, and installs soii in it (step 4 happens by itself). When it finishes, soii is running.

## 3b. Already have a vault

```bash
cd ~/path/to/your-vault
bun ~/soii-installer/bin/soii.ts install
```

Your notes aren't touched. soii adds a `.soii/` folder (its code, build and settings) and a `.claude/skills/` folder (its Claude Code skills). If the notes lack properties soii reads, run `/soii-setup` in Claude Code from inside the vault: it fills them in on a branch.

## Set up without AI

You don't need Claude Code. In a terminal, `soii install` with no vault named asks a few plain questions and does the rest. From a fresh clone (after step 1):

```bash
git clone --depth 1 https://github.com/westsoever/soii.git ~/soii-installer
cd ~/soii-installer && bun bin/soii.ts install
```

It checks first that Bun, git and GitHub access to the soii repo work, and prints the exact fix if not. Then, with the answer in `[brackets]` if you press Enter:

1. **New vault or existing?** [new]
2. New: the **folder** [`~`] and the **name** [`soii-vault`], then the full path to confirm (it must not exist yet, or be empty), and whether to add the sample notes [Y].
3. Existing: the path to your notes, then **in place** (soii adds `.soii/` and `.claude/skills/`; your notes aren't moved) or **copy** (your notes are copied into a new soii vault and the old one is never touched; the default, unless the folder already runs soii).
4. In place with no git yet: start a repository? [Y]
5. Start soii at login? [Y] (macOS) If no, run `soii start` whenever you want it.
6. Existing notes: a one-line summary of what `soii check` finds, then fill in the missing properties on notes that already have a `type`? [Y] It works on a branch `soii/setup`, shows the counts, and merges only after you say y. A value you wrote is never replaced.
7. Folders whose notes have no `type`: the biggest ones are listed, and for each you can pick a type from a numbered list or skip [skip]. Only notes without a `type` get one.
8. Open http://localhost:5011 now? [Y]

Before anything is written you see a recap and answer **Go ahead? [y/N]**. Ctrl-C at any question, or the end of the input, stops with nothing changed. `soii setup` asks the same questions even when the answers are piped in; `--no-service` installs into the vault only (no login question, nothing started); `soii install <vault>` and `soii install --yes` never ask and work as before.

## 4. What `install` does

1. Creates `<vault>/.soii/` with `package.json` (pins which soii release this vault uses) and a `.gitignore`.
2. Checks out that release into `.soii/soii/` with git and installs its packages.
3. Builds soii for your vault into `.soii/build/`.
4. Registers the vault in `~/.config/soii/config.json` and puts a `soii` command on your PATH (`~/.bun/bin` or `~/.local/bin`; it tells you if that folder isn't on PATH).
5. Copies soii's Claude Code skills into `<vault>/.claude/skills/`. Skills you made yourself are never touched.
6. If the vault is a git repository, **commits what it wrote** (`soii: install v0.1.1`): `.soii/package.json`, `.soii/.gitignore`, `.soii/skills.json` and the skill folders it installed. Nothing else is staged, so your own uncommitted work stays as it is, and the vault starts clean. The `.gitignore` inside `.soii/` keeps the checkout, build and secrets out.
7. On a Mac, installs a LaunchAgent (`~/Library/LaunchAgents/com.soii.server.plist`) and starts it. If nothing answers within 15 seconds it says so and prints the end of the log.

It is safe to run again.

**`--no-service`** (or `SOII_NO_SERVICE=1`), on `install`, `init` and `update`, installs into the vault only: no service, nothing in the background, and nothing outside the vault changed (no `soii` command, no LaunchAgent, no registry entry). For trying out a second vault or for tests. To run it later, `soii install` there without the flag.

Open it:

```bash
soii open       # http://localhost:5011
```

## Everyday use

| Command | What it does |
|---|---|
| `soii status` | Running or not, the address, which vault, the installed version and the newest |
| `soii open` | Opens http://localhost:5011 |
| `soii restart` | Restarts it (after editing `.soii/.env.local`, say) |
| `soii stop` / `soii start` | Stops it until you start it again or log in |
| `soii logs -f` | Shows the log; on a Mac it is `~/Library/Logs/soii.log` |
| `soii update` | Moves to the newest release: see [updating.md](updating.md) |
| `soii check` | Checks your notes' properties and structure |
| `soii uninstall` | Removes the service and the `soii` command. Your notes and `.soii/` stay |

Edit notes in Obsidian, in Claude Code or in soii, and soii picks the change up within a second or two. It watches the vault; there is nothing to rebuild by hand. Changes inside dot-folders (`.obsidian`, `.git`, `.soii`) are ignored.

## Writing from soii, and Sync

**Log**, **Add to vault** and the property editor write straight into your vault files and make a **local git commit**. Nothing leaves your computer until you push.

**Sync** (bottom left of the sidebar) does `git pull --ff-only`, then `git push` if your vault is ahead of its remote. It never merges, rebases or forces. If the vault and its remote have diverged, Sync shows git's message and changes nothing: fix it with `/soii-sync-fix` in Claude Code.

## Settings and secrets

- **Workspaces, tabs, labels, excluded folders:** `soii.config.yml` at your vault root. See [frontmatter.md](frontmatter.md) and [workspaces.md](workspaces.md). A typo fails the build with the exact line; the previous version keeps running.
- **API keys:** `.soii/.env.local` (never committed). Then `soii restart`.

  ```
  GOOGLE_BOOKS_API_KEY=...   # recommended: book covers. Google Cloud Console → Library → Books API → Credentials → API key
  TMDB_API_KEY=...           # optional: film and documentary posters. themoviedb.org → Settings → API
  ```

- **Port:** `soii install --port 5012` (default 5011). soii only listens on `127.0.0.1`.

### Book covers, once

Without a key, Google's shared quota runs out quickly and covers fall back to title tiles. A script can look each book up once and write the answer into the note:

```bash
cd ~/my-vault/.soii
VAULT_PATH=.. bun soii/scripts/fill-book-meta.ts --limit 50 --commit   # commits only the notes it changed
git -C .. push                                                         # when you're happy
```

It fills only a bare `cover:`, `author:` or `isbn:`; anything you've written stays. Books it can't match with confidence are listed for you to fill by hand. `--retry` tries the not-found ones again; `--dry-run` writes nothing.

## On your phone

`localhost` is your computer only, by design: your phone can't reach it, and soii has no sign-in to protect it if it could. To use soii on your phone, deploy a copy to Vercel: [deploy-vercel.md](deploy-vercel.md). That is optional, and independent of the local install.

## Light and dark

soii follows your device's colour scheme. There is no in-app toggle.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `soii init`/`install`: "git could not fetch soii …" | Run `gh auth login` and `gh auth setup-git`, and check you have access to `westsoever/soii`. |
| `soii: something else already answers on port 5011` | An old `bun app/serve.ts` or another program holds the port. Stop it, or install with `--port 5012`. |
| `soii status` says not running | `soii logs` shows why (a typo in `soii.config.yml` stops the first build). Fix it, then `soii restart`. |
| `soii: command not found` | The folder named in the install output isn't on your PATH. Add the `export PATH=…` line it printed to your shell profile. |
| A note you just wrote isn't there | Give it a couple of seconds; if it still isn't, `soii logs` shows whether recompiling failed. |
| Sync: "git pull failed" | The vault and its remote diverged, or you have uncommitted edits to a file that changed upstream. Run `/soii-sync-fix`. |
| Sync: "Couldn't push" | Your git login can't write to the vault's remote. `gh auth status`, then try `git -C <vault> push` by hand to see the message. |
| Browser shows `bad_host` | You opened soii through a name other than `localhost` or `127.0.0.1`. Use `http://localhost:5011`. |

## Removing soii

`soii uninstall` stops it and removes the service and the command. To remove everything else, delete `<vault>/.soii/` and `<vault>/.claude/skills/soii-*` yourself. Your notes are never touched.

## Developing soii itself

From a checkout of this repo (not an installed vault):

```bash
bun install
VAULT_PATH=/path/to/vault SOII_DEV_AUTH=1 bun run dev   # http://localhost:13390 (set PORT to change)
bun test app scripts && bun run typecheck
```

`SOII_LOCAL=1` is what an installed soii runs with: no sign-in, port 5011, loopback only. Developing, use `SOII_DEV_AUTH=1` and port 13390 so it never collides with your installed one.
