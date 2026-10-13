---
name: soii-setup
description: Make an Obsidian vault fully readable by soii, or start a new one. Starts a new vault from the template, or imports an existing vault's notes into a soii vault (or sets up in place), proposes which folders are books, people, goals, expenses and so on, then fills in every documented property on a branch (empty keys, plus values that can be worked out safely), adds the tracking sections and templates, and checks the result. Use when someone has just cloned or installed soii (the README's Quick start is clone, then /soii-setup), says their workspaces are empty or their notes have no properties, or wants to point soii at a new or existing vault.
---

# Set up a vault for soii

soii reads ordinary Obsidian notes and sorts them into workspaces by their frontmatter `type` (see `docs/frontmatter.md`). This skill gets a vault to the point where every workspace fills up and every typed note carries the full set of properties for its type, **without rewriting anyone's notes**. Everything happens on a branch; the owner approves before anything reaches their main branch.

Talk to the owner in plain words. They may never have heard the word "frontmatter". Call it "the properties at the top of a note".

## Where soii's scripts are

This skill runs from two places. Set `SOII` once and use it for every script and doc below:

```bash
SOII=.soii/soii     # Claude Code opened in a soii vault
[ -d "$SOII" ] || SOII=.         # or in the soii repo itself
```

`$SOII/docs/frontmatter.md` is the reference for every type and field; `$SOII/template/` is the starter vault.

### Run from a fresh soii clone (Quick start)

The README's Quick start is "clone soii, open Claude Code in the clone, type `/soii-setup`". In that case `SOII=.`, and the `soii` command usually isn't installed yet (`command -v soii` prints nothing). Don't fall back to copying files by hand: run the CLI from the clone, and it installs the `soii` command, the start-at-login service and the skills.

```bash
SOII_CLI="soii"; command -v soii >/dev/null || SOII_CLI="bun $PWD/bin/soii.ts"
[ -d node_modules ] || bun install --frozen-lockfile
```

Use `$SOII_CLI init <folder>` and `$SOII_CLI install` wherever this skill says `soii init` or `soii install`. Ask where the vault should live (suggest `~/soii-vault`, never inside the soii clone). After `init` or `install`, the remaining steps run **in the vault**: `cd` there, and set `SOII=<vault>/.soii/soii` from then on. When you hand over, tell the owner to open Claude Code in the vault next time, not in the clone. The clone can be deleted afterwards; the vault has its own copy of soii.

## 0. Which path?

Ask, unless it's obvious.

- **A. New vault, no notes yet.** `soii init <folder>` copies the template (sample notes included; add `--empty` to leave Sam's notes out) and installs soii in it. (From a fresh clone, use `$SOII_CLI` as above.) Then help them create a **private** GitHub repo if they want one (`gh repo create <name> --private --source . --push`). The template is already complete: skip to step 6.
- **B. Import an existing vault into a soii vault.** The old vault stays exactly as it is; its notes are copied into a fresh soii vault (`soii init <folder> --empty`) and fixed up there. Best when they want soii's folders, templates and `.soii/` in one place. Do steps 1–7.
- **C. Set up in place.** soii goes into the existing vault, and its notes are fixed up where they are. Best when the vault is already a git repo they push to (for example one a deploy or another tool reads). Do steps 1 and 3–7.

## 1. Make it safe to edit

The vault is the folder the owner names (path B: the new soii vault). Set `VAULT` to it (`.` when Claude Code is opened inside it).

```bash
git -C "$VAULT" status -sb
```

- Not a git repo: `git init` and commit everything as-is first, so every later change is reviewable and undoable.
- Uncommitted changes: ask the owner to commit or stash them first. Don't mix your edits with theirs. The exception is right after `soii init` or `soii install`: `.claude/skills/` and `.soii/skills.json` show as untracked, and those are soii's own files, not the owner's. Commit just those (`git add .claude/skills .soii/skills.json && git commit -m "soii: install skills"`) and carry on.

Then branch: `git -C "$VAULT" switch -c soii/setup`.

## 2. Import (path B only)

`OLD` is the vault they're importing from. Never write to it.

```bash
bun "$SOII/scripts/vault-import.ts" "$OLD" "$VAULT" --dry-run     # what would be copied, and what clashes
bun "$SOII/scripts/vault-import.ts" "$OLD" "$VAULT"
```

It copies notes, attachments and the owner's `soii.config.yml`, keeps modification times, and **never overwrites**: a path that already exists in the new vault is listed as kept. It leaves `.git`, `.obsidian`, `.github`, `.claude`, `.soii` and `.trash` behind.

- **Clashes:** show the list. The usual one is `soii.config.yml`: ask whether to keep the template's or theirs (if theirs, `cp "$OLD/soii.config.yml" "$VAULT/"`).
- **Obsidian settings** (`.obsidian/`) aren't copied. Tell them, and offer to carry over anything they want by hand.
- **Daily notes:** check `$VAULT/.obsidian/daily-notes.json`. soii wants daily notes named `YYYY-MM-DD.md`, so the `format` should be `YYYY-MM-DD` and `folder` should be where their daily notes are. Fix the file if not. Never rename existing notes; list any daily notes that aren't named by date and leave them.
- Their git history stays in the old vault. Remember `OLD` for step 5.

Commit: `soii: import notes from <old vault name>`. The import then reads as one reviewable commit.

## 3. Survey

```bash
bun "$SOII/scripts/check-vault.ts" "$VAULT"          # what soii already understands, and what it trips over
find "$VAULT" -name '*.md' -not -path '*/.*' | sed "s|$VAULT/||" | awk -F/ 'NF>1{print $1"/"$2}' | sort | uniq -c | sort -rn | head -40
```

Open 2–3 notes from each big folder and read their properties (not their bodies beyond what you need). Note which already have `type:`, and which folders clearly hold one kind of thing: a `Books/` folder, a `People/` folder, daily notes named `YYYY-MM-DD.md`, and so on.

## 4. Propose a mapping and get a yes

Show the owner a short table and wait for their answer:

| Folder | Notes | Looks like | Proposed `type` | Already typed |
|---|---|---|---|---|
| `Reading/` | 84 | books | `book` | 12 |
| `Contacts/` | 40 | people | `person` | 0 |
| `Journal/` | 300 | daily notes | none: dated file names are enough | n/a |
| `Random/` | 25 | mixed | leave alone | n/a |

Rules for the proposal:

- Only propose a type for a folder that is clearly one kind of thing. A mixed folder stays as it is.
- Prefer the owner's existing words: if they already use `type: contact`, that's an accepted alias for `person`, so keep it.
- If they use a type soii doesn't know (`type: cocktail`), suggest adding it as a workspace tab in `soii.config.yml` instead of renaming their notes.
- Folders soii should ignore (archives, attachments, templates, private journals) go in `soii.config.yml` as excludes. Ask about anything that looks private.

## 5. Fill in the properties

`scripts/vault-normalise.ts` does the mechanical work, so you don't hand-edit hundreds of notes. For each typed note it adds **every key the docs list for that type**, as an empty key (`rating:`), and fills only values that can be worked out safely:

| Key | Filled from | Only when |
|---|---|---|
| `type` | the folder mapping (`--type`) | the note has no type; an existing type is never changed |
| `author` | a `Title — Author` file name (spaced em or en dash, the tail reads as a name) | the key is missing or empty |
| `last_contact` | the newest dated list item (`- 2026-09-24: …`) not in the future | the key is missing or empty |
| `cadence` | the relationship's default (friend → `monthly`, D65) | the key is missing; a bare `cadence:` is kept, it means "use the default" |
| `created` | the first git commit that added the file | the key is missing |

It never overwrites a value, never guesses `status`, `rating`, `price`, `amount` or any date, never writes `title` (soii takes it from the file name, and a stored copy goes stale when a note is renamed), and never touches body text unless `--sections` is given. It does not commit.

For each folder the owner approved in step 4 (type it, fill it), one folder at a time:

```bash
bun "$SOII/scripts/vault-normalise.ts" "$VAULT" --only 'Reading/' --type 'Reading/=book'            # dry run: what would change
bun "$SOII/scripts/vault-normalise.ts" "$VAULT" --only 'Reading/' --type 'Reading/=book' --write
git -C "$VAULT" add -A && git -C "$VAULT" commit -m "soii: type and fill properties in Reading/ (book)"
```

- Path B: add `--history "$OLD"` so `created` comes from the old vault's git history, not from today's import commit.
- **People folders:** add `--sections` so each person ends with an empty `## Notes & dated interactions` heading, where soii's Log writes dated entries. For other types `--sections` adds `## Log`; soii creates that heading itself the first time something is logged, so only add it if the owner wants the headings in place. It appends one empty heading and never changes existing text.
- The dry run prints the notes it would change and the keys it would add (key names only). Show the owner the counts; they approve before `--write`.
- Notes it **skips** are listed with a reason: `hidden` (marked `soii: hidden`, left alone), `base64`, or `unreadable frontmatter`. For broken YAML, repair only obvious syntax slips (see the soii-health skill's table) and tell the owner which ones, then run it again.
- It is safe to run again: a second run changes nothing.

Finally, one run **without** `--only` for notes that already carry a type but live in folders you didn't map (dry run first, then `--write`, one commit: `soii: fill properties on the remaining typed notes`).

## 6. Config and templates

- **`soii.config.yml`** at the vault root: start from `$SOII/template/soii.config.yml`. Keep only what this vault needs (excludes, renamed workspaces, extra tabs). An absent config is fine too: soii's defaults work. Validate by running the checker again; a config typo shows up there and in the build.
- **Templates:** copy the files in `$SOII/template/Templates/` that the vault doesn't already have into `$VAULT/Templates/` (never overwrite), so a new note made in Obsidian starts with the same complete properties. Check `.obsidian/templates.json` points at that folder.
- **Daily notes:** `YYYY-MM-DD.md` in the daily folder, as set up in step 2 (path A already has it).

Commit: `soii: config and templates`.

## 7. Check and hand over

```bash
bun "$SOII/scripts/check-vault.ts" "$VAULT"
git -C "$VAULT" log --oneline main..HEAD
git -C "$VAULT" diff --stat main..HEAD
```

The checker should show no `missing-field` rows for the folders you filled in. Warnings that remain (unknown types, broken links) are the owner's to decide on; list them, don't fix them here.

If soii runs, have the owner open it (`soii open`, or http://localhost:5011 in the soii repo with `bun run dev`) and click through the workspaces.

Then ask how they want to land it: merge the branch locally (and push if the vault has a remote), or push the branch and open a pull request to review on GitHub. Don't merge or push without that answer.

## Rules

- These are someone's private notes. Show paths, key names and property values, not note contents.
- Never delete, move or rename a note. Never `git push --force`, `reset --hard`, or `clean`. Never write to the vault you're importing from.
- When unsure whether a folder is one kind of thing, leave it out and say so. A half-typed folder is worse than an untyped one.
- Afterwards, suggest scheduling the weekly **soii-health** check (see `$SOII/docs/skills.md`).
