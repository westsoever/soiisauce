---
name: soii-update
description: Bring the soii installed in the owner's vault up to the newest release, keeping their notes, soii.config.yml and keys. Shows what's new in plain words, runs `soii update`, checks it came back, and commits the new pin. Use when the owner asks to update soii, get the latest version, says a feature they saw elsewhere is missing, or `soii status` says a newer release is available.
---

# Update soii

Every soii install runs the same code. What makes it yours lives outside the code: your notes and `soii.config.yml` are in your vault, your keys in `.soii/.env.local`. An update replaces only soii's own code (`.soii/soii/`, `.soii/build/`) and its skills. See `docs/updating.md`.

## 1. Look first

```bash
soii status
git status -sb        # in the vault
```

- `soii status` says `latest`: tell them they're up to date. Stop. (When a newer release exists, soii's sidebar shows **Update available** below Sync, and `soii status` says to run `/soii-update`.)
- `soii status` isn't found or says soii isn't installed: use **/soii-install** instead.
- If the vault has uncommitted changes, that's fine for soii: an update only touches `.soii/` and soii's skill folders, and its commit includes only those.
- If you are in the soii repo itself (a development checkout, no `.soii/`), this isn't the flow: `git pull --ff-only` and stop.

## 2. Update

```bash
soii update
```

It fetches the newest release with git, prints **What's new** (the new `DECISIONS.md` entries) and two links, moves the pin, rebuilds, refreshes the skills, commits them and restarts. Summarise what's new for the owner in plain words, one line per entry, and say which workspaces or skills it touches. Then give them the two links the command printed:

- **Release notes:** `https://github.com/westsoever/soii/releases/tag/vX.Y.Z`
- **What changed:** `https://github.com/westsoever/soii/compare/vOLD...vNEW`

If an older `soii update` didn't print them, build them from the old and new versions in `soii status`.

If it fails: "git could not fetch" is GitHub access (`gh auth login`, `gh auth setup-git`); anything else, read the message, and `soii logs`. A failed fetch leaves the working install as it was.

## 3. Check it came back

```bash
soii status            # running, new version, "latest"
soii open
```

If it says not running, `soii logs`. Don't repeat the update; read the log.

## 4. The commit

`soii update` commits what it changed in the vault by itself (`soii: update to <version>`): the pin in `.soii/package.json`, `.soii/skills.json` and the skill folders it installed or removed, and nothing else. Show it with `git log -1 --stat`. Don't push unless they ask.

If a release renamed or dropped skills, the output said which old folders were removed. Mention it: only folders soii installed are ever removed, never their own skills.

## Other places soii runs

If the owner also deploys a copy to Vercel, that copy updates separately (**Sync fork** on their soii fork, or the weekly workflow): see `docs/updating.md`.

## Rules

- Never edit files in `.soii/soii/`; they're replaced on every update. Behaviour changes belong in `soii.config.yml`.
- Never print keys from `.soii/.env.local`.
