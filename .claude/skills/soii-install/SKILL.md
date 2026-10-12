---
name: soii-install
description: Walk a new owner through installing soii on their own computer, from GitHub access to the private repo, through a new vault from the starter or soii added to an existing vault, to the soii command, the start-at-login service and a first look at http://localhost:5011. Use when someone has just cloned soii and asks how to set it up, install it, or run it, or says soii isn't running.
---

# Install soii

soii runs on the owner's own computer, inside their vault, at `http://localhost:5011`. `docs/setup.md` is the source of truth. Your job is to run it with them, one step at a time, and check each step worked. Allow about 10 minutes.

This skill lives in the soii repo (the installer clone). It is not copied into vaults: once soii is installed, `/soii-intro` is the tour and `soii update` in a terminal keeps it current.

## Before you start

Check what's there and say what you found:

```bash
bun --version; git --version; gh --version
gh auth status 2>&1 | head -3
soii status 2>&1 | head -3        # already installed?
```

- No Bun: `curl -fsSL https://bun.sh/install | bash`, then open a new terminal.
- `soii status` already shows a vault: soii is installed. Ask what they want (update: `soii update` in a terminal; a second vault: `soii install` inside it switches this machine to that vault, so confirm first).
- Not signed in to GitHub: `gh auth login`, then `gh auth setup-git`. soii's repo is private, and git reads it with that login. If `git ls-remote https://github.com/westsoever/soii.git` prints tags, access works.

Ask one thing: **do they already have a vault?** (an Obsidian folder of notes)

## The steps

1. **The installer.** If this folder isn't already the soii repo, `git clone --depth 1 https://github.com/westsoever/soii.git ~/soii-installer`. Use the path of the clone you are in below (`$SOII`).
2. **New vault:** `bun $SOII/bin/soii.ts init ~/my-vault` (ask where; add `--empty` if they want no sample notes, `--title "…"` for a title other than the folder name). It copies the starter, makes the first git commit, and installs soii.
   **Existing vault:** `cd <vault> && bun $SOII/bin/soii.ts install`. Their notes aren't touched; soii adds `.soii/` and `.claude/skills/`.
3. **Check:** `soii status` shows `running`, the vault, the version. If the `soii` command isn't found, the install output named a folder to add to PATH: give them the `export PATH=…` line for their shell profile.
4. **Look:** `soii open`. For a new vault they should see the sample notes; for an existing one, their notes, possibly with empty workspaces.
5. **Existing vault with empty workspaces or notes lacking properties:** run **/soii-setup** from inside the vault. It fills in the properties on a branch.
6. **Commit:** install already committed `.soii/package.json`, `.soii/.gitignore`, `.soii/skills.json` and the skills (`soii: install v…`) if the vault is a git repo, so `git status` starts clean. Check with `git -C <vault> log -1 --stat`. A vault that isn't a git repo: suggest `git init` and a first commit.
7. **Covers (optional):** put `GOOGLE_BOOKS_API_KEY=…` in `<vault>/.soii/.env.local` (never in a command line or a commit), then `soii restart`.

## If something fails

- "git could not fetch soii": GitHub access (the `gh auth` step under "Before you start"), or no access to `westsoever/soii` yet.
- "something else already answers on port 5011": an old `bun app/serve.ts` or another program. Find it with `lsof -i :5011`, stop it with the owner's yes, then `soii start`.
- Not running after install: `soii logs`. A typo in `soii.config.yml` stops the first build and the message names the line.

## Rules

- Never print, echo or commit a token or key. `.env.local` is untracked on purpose.
- Never delete or overwrite the owner's notes. `soii install` doesn't, and neither should you.
- The vault repo should be **private**. Say so if it isn't.
- When it works, suggest **/soii-intro** (the tour) and the weekly **/soii-health** check, and point at `docs/skills.md`. A copy on Vercel for the phone is optional: `docs/deploy-vercel.md`.
