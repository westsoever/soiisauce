# Updating soii

Every soii install runs the **same code**. What makes yours yours lives somewhere else:

| What | Where it lives | Touched by an update? |
|---|---|---|
| Your notes | your vault | never |
| Workspaces, tabs, labels, excluded folders | `soii.config.yml` in your vault | never |
| API keys | `.soii/.env.local` in your vault (never committed) | never |
| Which release you run | `.soii/package.json` in your vault | yes: this is the pin an update moves |
| soii's code and build | `.soii/soii/` and `.soii/build/` (not committed) | yes: replaced |
| soii's Claude Code skills | `.claude/skills/soii-*` in your vault | yes: refreshed (see below) |

If you want soii to look or behave differently, change `soii.config.yml` rather than the code in `.soii/soii/`: that folder is replaced on every update.

## Knowing there is one

soii checks GitHub for a newer release when it starts, every six hours, and right after you press **Sync** (`git ls-remote --tags`, with your git login), and remembers the answer. When one exists, an **Update available** line appears under **Sync** in the sidebar (in the **More** menu on a phone). Hover it, focus it or tap it: it says which version is available and which you have, with a button that copies `soii update` and a link to the release notes. `soii status` says the same in the terminal. `soii restart` checks at once. Offline, or without git access to the repo, nothing shows and nothing breaks. Up to date, nothing shows.

## Update

```bash
soii update
```

It looks for the newest release tag on GitHub, and if yours is older:

1. fetches that release into `.soii/soii/` with git and installs its packages,
2. shows **what's new** (the new entries of soii's `DECISIONS.md`, one line each) with the links to the release notes on GitHub and to what changed since your version,
3. moves the pin in `.soii/package.json`,
4. rebuilds, refreshes the skills, commits what it changed in your vault (`soii: update to v0.1.1`: the pin, `.soii/skills.json` and the skill folders, nothing else) and restarts soii.

If the fetch fails, the working install stays as it was. `soii status` shows your version and the newest one. The vault stays clean after an update; push it when you like.

`soii update` in a terminal is the one way to update: it prints what's new and the links, rebuilds, and restarts, and `soii status` then shows the new version.

## Skills

Every folder in soii's `.claude/skills/` is copied into your vault's `.claude/skills/`, except `soii-install` (it's for machines that don't have soii yet). `.soii/skills.json` lists what soii installed. When a release renames or drops a skill, the next update removes the old folder, and **only** folders listed there: a skill you wrote yourself, or one you copied in, is never touched. If you edit a soii skill, keep a copy under another name: updates overwrite it.

## Pinning and going back

Releases are git tags (`v0.1.0`, `v0.2.0`, …). `soii update` always moves to the newest. To stay on, or return to, a particular one:

```bash
soii install --from v0.1.0      # pins that tag, fetches it, rebuilds, restarts
```

## What's new?

`docs/superpowers/DECISIONS.md` in soii has one numbered entry per feature or change, newest at the bottom; `soii update` prints the new ones. After an update you can read the full file in `.soii/soii/docs/superpowers/DECISIONS.md`.

## If you deployed to Vercel too

A Vercel deployment runs the code of your soii **fork**, so it updates separately:

- **GitHub button:** your fork → **Sync fork** → **Update branch**. Vercel redeploys.
- **Automatically every week:** copy [`templates/soii-update-workflow.yml`](../templates/soii-update-workflow.yml) into your fork as `.github/workflows/soii-update.yml` and enable Actions. If your fork has conflicting code changes, the run fails and changes nothing.

See [deploy-vercel.md](deploy-vercel.md).

## For the soii maintainer

A release is a tag `vX.Y.Z` on `main` whose `package.json` says the same version. Keep `main` releasable: merge only with `bun test app scripts` and `bun run typecheck` green, add a `DECISIONS.md` entry for anything an owner will notice, and mention any new setting in `.env.example` and [setup.md](setup.md). The full release flow, with the commands, is in [releasing.md](releasing.md).
