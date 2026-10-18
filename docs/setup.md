# Set up soii

soii runs **on your own computer**, inside your vault, at `http://localhost:5011`. Your notes stay on your machine. There is no sign-in, because nothing but your computer can reach it. [privacy.md](privacy.md) lists the few things soii asks the internet for (exchange rates, covers, the update check) and how to turn them off. Allow about 10 minutes.

**You need:** a Mac or a Linux computer, [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`; the installer offers to do it for you), and git. [Obsidian](https://obsidian.md) and Claude Code are optional: soii works on any folder of Markdown notes and nothing below needs Claude Code. **Windows** isn't supported natively: use WSL2 and follow the Linux steps (not tried there yet).

**Mac or Linux?** On a Mac, soii is a LaunchAgent: it starts at login and restarts if it stops. On Linux it is a plain background process: it does not start again after a reboot and nothing restarts it if it crashes. Run `soii start` when it is down (`soii status` says).

## The short way

In a terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/westsoever/soiisauce/main/install.sh | bash
```

`install.sh` checks that git, Bun and GitHub can be reached (and prints the exact fix if not), clones soii to a temporary folder, runs the plain-questions install described in [Set up without AI](#set-up-without-ai), and deletes the clone. You are left with the vault, `.soii/` in it and the `soii` command. Nothing needs Claude Code.

Arguments go to soii: `... | bash -s -- init ~/my-vault --samples`, `... | bash -s -- ~/my-vault --yes`, `... | bash -s -- --no-service`. With no terminal to ask on (a pipe into a script, CI) a bare run stops and says so; name the vault or add `--yes`. If Bun is missing it offers to install it. `SOII_REF=v0.1.9` installs a given tag or branch of the installer.

Steps 2 to 4 below are the same thing by hand: use them if you'd rather clone the repo yourself.

## 1. Check that git can reach soii

soii is released as git tags on a public GitHub repo, so git fetches it without a login. Check that git can reach it:

```bash
git ls-remote https://github.com/westsoever/soiisauce.git HEAD
```

## 2. Get the `soii` command

Clone soii once, only to run its installer, and install its packages in the clone (soii can't run without them). The installer puts everything in your vault, so you can delete this clone afterwards.

```bash
git clone --depth 1 https://github.com/westsoever/soiisauce.git ~/soii-installer
(cd ~/soii-installer && bun install --frozen-lockfile)
```

## 3a. New to soii: make a vault from the starter

```bash
bun ~/soii-installer/bin/soii.ts init ~/my-vault             # empty: the top folders and the templates
bun ~/soii-installer/bin/soii.ts init ~/my-vault --samples   # or with Sam's sample notes, to look around
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

You don't need Claude Code. In a terminal, `soii install` with no vault named asks a few plain questions and does the rest. `install.sh` above starts it for you; from a fresh clone you start it yourself (after step 1):

```bash
git clone --depth 1 https://github.com/westsoever/soiisauce.git ~/soii-installer
cd ~/soii-installer && bun install --frozen-lockfile && bun bin/soii.ts install
```

It checks first that Bun, git and GitHub access to the soii repo work, and prints the exact fix if not. Then, with the answer in `[brackets]` if you press Enter:

1. **New vault or existing?** [new]
2. New: the **folder** [`~`] and the **name** [`soii-vault`], then the full path to confirm (it must not exist yet, or be empty), and whether to fill it with Sam's sample notes [N]. Without them the vault starts empty: the top folders and the templates.
3. Existing: the path to your notes, then **in place** (soii adds `.soii/` and `.claude/skills/`; your notes aren't moved) or **copy** (your notes are copied into a new soii vault and the old one is never touched; the default, unless the folder already runs soii).
4. In place with no git yet: start a repository? [Y]
5. Start soii at login? [Y] (Mac only; on Linux it isn't offered, because soii runs in the background until you stop it or restart the computer.) If no, run `soii start` whenever you want it.
6. Existing notes: a one-line summary of what `soii check` finds, then fill in the missing properties on notes that already have a `type`? [Y] It works on a branch `soii/setup`, shows the counts, and merges only after you say y. A value you wrote is never replaced.
7. Folders whose notes have no `type`: the biggest ones are listed, and for each you can pick a type from a numbered list or skip [skip]. Only notes without a `type` get one.
8. Open http://localhost:5011 now? [Y]

Before anything is written you see a recap and answer **Go ahead? [y/N]**. Ctrl-C at any question, or the end of the input, stops with nothing changed. `soii setup` asks the same questions even when the answers are piped in; `--no-service` installs into the vault only (no login question, nothing started); `soii install <vault>` and `soii install --yes` never ask and work as before.

## 4. What `install` does

1. Creates `<vault>/.soii/` with `package.json` (pins which soii release this vault uses) and a `.gitignore`.
2. Checks out that release into `.soii/soii/` with git and installs its packages.
3. Builds soii for your vault into `.soii/build/`.
4. Registers the vault in `~/.config/soii/config.json` and puts a `soii` command in the first of `~/.bun/bin`, `~/.local/bin`, `~/bin`, `/opt/homebrew/bin` or `/usr/local/bin` that is on your PATH and writable. If none is, it prints one line at the very end to paste into your shell's startup file.
5. Copies soii's Claude Code skills into `<vault>/.claude/skills/`. Skills you made yourself are never touched.
6. If the vault is a git repository, **commits what it wrote** (`soii: install v0.1.1`): `.soii/package.json`, `.soii/.gitignore`, `.soii/skills.json` and the skill folders it installed. Nothing else is staged, so your own uncommitted work stays as it is, and the vault starts clean. The `.gitignore` inside `.soii/` keeps the checkout, build and secrets out.
7. On a Mac, installs a LaunchAgent (`~/Library/LaunchAgents/com.soii.server.plist`) and starts it. On Linux it starts a background process instead (no start at boot, no restart after a crash: run `soii start`). If nothing answers within 15 seconds it says so and prints the end of the log. Before any of this, a taken port (`--port`) stops the install with nothing written.

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
| `soii update` | Moves to the newest release and prints what's new from `CHANGELOG.md`: see [updating.md](updating.md) |
| `soii check` | Checks your notes' properties and structure |
| `soii uninstall` | Removes the service and the `soii` command. Your notes and `.soii/` stay |

Edit notes in Obsidian, in Claude Code or in soii, and soii picks the change up within a second or two. It watches the vault; there is nothing to rebuild by hand. Changes inside dot-folders (`.obsidian`, `.git`, `.soii`) are ignored.

## Writing from soii, and Sync

**Log**, **Add to vault** and the property editor write straight into your vault files and make a **local git commit**. Nothing leaves your computer until you press **Sync** (or push yourself).

**Sync** (bottom left of the sidebar) does `git pull --ff-only`, then `git push` if your vault is ahead of its remote. If both sides have new commits (say, captures made here and an agent's notes on GitHub), it merges GitHub's in, but only when git says the merge is clean and touches none of your uncommitted edits; then it pushes. It never rebases or forces. The first time it is about to push to a remote, soii names that remote and asks you to confirm; it remembers the answer for that remote. If the vault isn't connected to a remote yet (a vault made with `soii init` starts that way), Sync says so and shows the commands that connect it: `git remote add origin <repository URL>` and `git push -u origin main`. If the vault and its remote both changed the same note, or GitHub changed a note you are editing, Sync says which and changes nothing: fix it with `/soii-sync-fix` in Claude Code.

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

`localhost` is your computer only, by design: your phone can't reach it, and soii has no sign-in to protect it if it could. soii has no hosted version.

## Light and dark

soii follows your device's colour scheme. There is no in-app toggle.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `soii init`/`install`: "git could not fetch soii …" | Check the connection (`git ls-remote https://github.com/westsoever/soiisauce.git HEAD`). From a private fork: `gh auth login` and `gh auth setup-git`. |
| `port 5011 is already in use by another program` | An older soii or another program holds the port. Stop it, or install with `--port 5012` (`... \| bash -s -- --port 5012` for the one-line install). Nothing is written before this check. |
| The one-line install stops after the first question | Run it as `bash -c "$(curl -fsSL https://raw.githubusercontent.com/westsoever/soiisauce/main/install.sh)"`: that gives soii your terminal directly. (The piped form hands it the terminal's own device; if `ps` can't name it, it falls back to `/dev/tty`, which some Bun versions can't read on macOS.) |
| "git doesn't know who you are" (a commit didn't happen) | `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`, then run the command the install printed to save the commit. |
| "git can't run yet" on a Mac | Apple's command line tools are missing: `xcode-select --install`, click Install, wait, then run the install again. |
| Linux: nothing at `localhost:5011` after a reboot | soii doesn't start at boot on Linux: `soii start`. |
| Sync: "This vault isn't connected to GitHub yet" | The vault has no remote, or its branch doesn't track one. Create an empty (private) repository on GitHub, then run the command the message shows, once, in the vault folder. |
| `soii status` says not running | `soii logs` shows why (a typo in `soii.config.yml` stops the first build). Fix it, then `soii restart`. |
| `soii: command not found` | Open a new terminal window. If it's still missing, the folder the install named isn't on your PATH: paste the line it printed at the end into your shell's startup file (`~/.zshrc` for zsh), then open a new window. |
| A note you just wrote isn't there | Give it a couple of seconds; if it still isn't, `soii logs` shows whether recompiling failed. |
| Sync: "both changed …" or "git pull failed" | The vault and its remote changed the same note, or you have uncommitted edits to a file that changed upstream. Run `/soii-sync-fix`. |
| Sync: "Couldn't push" | Your git login can't write to the vault's remote. `gh auth status`, then try `git -C <vault> push` by hand to see the message. |
| Browser shows `bad_host` | You opened soii through a name other than `localhost` or `127.0.0.1`. Use `http://localhost:5011`. |

## Removing soii

`soii uninstall` stops it and removes the service and the command. To remove everything else, delete `<vault>/.soii/` and the soii skills in `<vault>/.claude/skills/` (`soii-*`, `skillfactory`, `unbox`; `.soii/skills.json` lists them all) yourself, and the log (`~/Library/Logs/soii.log` on a Mac, `~/.local/state/soii/soii.log` on Linux). If the vault is a git repository, commit the removal. Your notes are never touched. Bun and git stay installed.

## Developing soii itself

From a checkout of this repo (not an installed vault):

```bash
bun install
VAULT_PATH=/path/to/vault bun run dev   # http://localhost:13390 (set PORT to change)
bun test app scripts && bun run typecheck
```

`SOII_LOCAL=1` is what an installed soii runs with: no sign-in, port 5011, loopback only. Developing, `bun run dev` uses port 13390 so it never collides with your installed one.
