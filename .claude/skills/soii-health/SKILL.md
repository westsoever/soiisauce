---
name: soii-health
description: Weekly vault check-up for soii. Finds notes soii can't read properly (broken frontmatter, unknown types, bad dates or values, broken links, missing properties, stale Inbox), fixes the safe mechanical ones on a branch, and opens a pull request on the vault repo with a report of everything else. Use when the owner asks for a vault health check, a frontmatter fix-up, or when a scheduled cloud routine runs it.
---

# Vault health

You check the owner's Obsidian vault against what soii understands, fix what is safe to fix, and hand the rest back as a report. You work on a **branch** and, when the vault has a GitHub remote, open a **pull request**. You never push to the vault's main branch: that's the owner's to decide, and these are their private notes. (A vault on the owner's own computer may have no remote at all: see step 5.)

## 1. Find soii's scripts and the vault

There are two ways this runs. Work out which, then set two variables:

- **Inside the vault** (the vault has a `.soii/` folder, and Claude Code was opened in the vault): the vault is `.` and soii's scripts are in the pinned install.

  ```bash
  VAULT=.
  SOII=.soii/soii
  ```

- **From a soii checkout** (a cloud routine, or soii's own repo with the vault elsewhere): the scripts are in the repo. The vault is, in order of preference:
  1. the path the prompt gives you;
  2. `VAULT_PATH` in soii's `.env.local` (read only that line, never print tokens);
  3. in a cloud session, the other checked-out repo: a sibling folder containing `.obsidian/` or `soii.config.yml`. `ls ..` and look.

  ```bash
  SOII=.
  VAULT=/path/to/vault
  ```

If you can't find the vault, stop and say so. Don't guess.

```bash
git -C "$VAULT" status -sb        # must be clean
git -C "$VAULT" log --oneline -3
```

If the vault has uncommitted changes, stop and report: someone is mid-edit. One exception: right after `soii init` or `soii install`, `.claude/skills/` and `.soii/skills.json` show as untracked. Those are soii's own files, not the owner's edits. Commit just those (`git add .claude/skills .soii/skills.json && git commit -m "soii: install skills"`) and carry on.

## 2. Run the checker

Needs Bun. In a cloud session without it: `curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH"`. In a soii checkout run `bun install --frozen-lockfile` first (inside a vault, `.soii/` is already installed). Then:

```bash
bun "$SOII/scripts/check-vault.ts" "$VAULT" --json > /tmp/vault-findings.json
bun "$SOII/scripts/check-vault.ts" "$VAULT"            # the readable version
```

The checker is read-only and uses soii's own parser, so its findings are exactly what soii trips over. `$SOII/docs/frontmatter.md` is the reference for every type and field.

The readable version ends with a **Missing properties** table: how many notes of each type lack keys the docs list for that type, and which keys most often. That is the `missing-field` info rule. Don't fix these in a health run (a vault with hundreds of notes would get a hundred-file pull request); report the table and point to `/soii-setup`, which adds them as empty keys in reviewable commits.

## 3. Also look for (report only, do all four every run)

- **Inbox backlog:** notes in the inbox folder (`00-Inbox/` or whatever the vault uses) older than 14 days, by last commit date: `git -C "$VAULT" log -1 --format=%cs -- <file>`. Cloud checkouts are shallow: run `git -C "$VAULT" fetch --unshallow` first, or fall back to the note's `created:` date.
- **Orphans:** notes with **no `type`** that nothing links to and that aren't daily notes, briefs, or templates. Typed notes (books, people, goals…) show up in soii's workspaces, so they're never orphans. Cap the list at 20 and give the total.
- **Missing properties:** the checker's table, as is: type, note count, most-missed keys. One line per type, never one per note.
- **Stale people:** if the People workspace is used, persons whose `last_contact` is far past their `cadence`. One line each; the owner decides.

## 3b. This vault's own checks (report only)

If `$VAULT/.claude/soii-health.local.md` exists, read it and run every check it describes, in addition to everything above. It's the owner's file: the checks that only make sense for this vault (notes that contradict a facts file, stale projects, a folder structure to keep, maps that should list things). Rules for these:

- **Report only.** Whatever the file says, don't edit notes for these checks. Their findings go in the same report, under their own heading: **This vault's checks**, one bullet per finding, paths and a short reason.
- A check you can't run (a file it names is missing, an instruction is unclear) is reported as "couldn't run: <check>, <why>". Don't improvise a replacement.
- The file may name private files (identity or facts notes). Read them to compare, never quote them in the report.
- No file, no section. Don't create the file; `$SOII/docs/skills.md` says how an owner writes one.

## 4. Fix only what is safe

Create a branch first: `git -C "$VAULT" switch -c soii/health-$(date +%F)`.

**Fix** (frontmatter only, smallest possible edit, one note at a time):

| Finding | Fix |
|---|---|
| YAML that doesn't parse because of an obvious syntax slip (unquoted `:` in a title, a tab indent, a missing closing quote) | Repair the syntax. Keep every key and value. |
| `enum-case`: a value that differs only in case (`status: Reading`). soii already reads it, so this is tidying | Lower-case it to the documented value. |
| Date that is unambiguous but not `YYYY-MM-DD` (`2026-10-5`, `5 October 2026`) | Rewrite it as ISO. Leave `05/10/2026`-style dates alone: day/month order is a guess. |
| `missing-type` finding where **every** other note in the folder has that type (the message says "N of the N notes") | Add the suggested `type:`. |

**Never** (report these instead):

- Change a note's body text, rename, move, or delete a file.
- Change a value's meaning (a rating, a status that isn't just casing, an amount, a date you'd have to guess).
- Touch `soii: hidden` / `publish: false`, or any hidden note beyond a syntax repair.
- Fix broken links by creating notes or rewriting links.
- Edit `.obsidian/`, `.github/`, `.soii/`, or `soii.config.yml`.
- Decode base64-encoded notes. Report them; the owner fixes those by hand.

After fixing, run the checker again and confirm the error count went down and nothing new appeared.

## 5. Report: a pull request, an issue, or nothing

| You fixed something | Something to report | Do |
|---|---|---|
| yes | either | **Pull request** with the fixes and the full report (below) |
| no | yes | **Issue** on the vault repo, same title and body (there's no commit to put a PR on) |
| no | no | Nothing. Say "Vault is healthy" with the checker's summary line |

**No GitHub remote** (`git -C "$VAULT" remote` prints nothing, or `gh` isn't set up): a vault that lives only on the owner's computer. Don't push and don't try to open anything. If you fixed something, commit it on the branch (`git -C "$VAULT" add -A && git -C "$VAULT" commit -m "soii: vault health $(date +%F)"`), switch back to the branch the owner was on, and give them the report in your reply, with the branch name and `git merge soii/health-<date>` as the way to take the fixes. If you fixed nothing, the reply is the report. Skip the rest of this step.

Before creating either, look for an open PR **or** issue titled `Vault health — …`. If one exists, comment on it with this week's report instead of opening another, and don't stack fixes on top of unmerged ones. If the findings are identical to the last report, say so in one line ("unchanged since last week") rather than repeating the full list.

For a pull request:

```bash
git -C "$VAULT" add -A
git -C "$VAULT" commit -m "soii: vault health $(date +%F)"
git -C "$VAULT" push -u origin HEAD
```

Open a PR against the vault's default branch (use `gh pr create` if it's available, or the session's GitHub tool). For an issue, `gh issue create` or the GitHub tool. Title: `Vault health — YYYY-MM-DD`. Body:

```markdown
## Fixed (N notes)
- `path/to/note.md`: status `Reading` → `reading`
…

## Needs you
- **Broken frontmatter I didn't touch:** …
- **Unknown types:** `type: recipe` in 4 notes (add it to soii.config.yml, or rename)
- **Broken links:** …
- **Inbox older than 14 days:** …
- **Orphans:** …
- **This vault's checks:** one bullet per finding from `.claude/soii-health.local.md`
- **Missing properties:** book 700 (rating, finished, started), person 93 (phone, birthday) — run `/soii-setup` to add them

Checker before: E errors, W warnings · after: E errors, W warnings
```

Show at most the note **paths** and the property values involved. Don't paste note contents into the PR or issue. In an issue, leave out the "Fixed" section.

## 6. Finish

Reply with the PR or issue link (or the branch name when there's no remote, or "Vault is healthy") and the before/after checker counts.

## Schedule it weekly

From a Claude Code session in soii (or in your vault), run `/schedule` and ask for a weekly routine with **both** the soii repo and the vault repo as sources, using this prompt:

> Run the soii-health skill from the soii repo (`.claude/skills/soii-health/SKILL.md`) against the vault repo checked out next to it. Follow it exactly: fix only the safe items on a branch, report through one pull request or issue on the vault repo, never push to main.

The routine needs GitHub access to the vault repo to push the branch and open the PR.
