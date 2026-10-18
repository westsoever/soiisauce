---
name: soii-sync-fix
description: Diagnose and fix a failed soii Sync (git pull) or a failed "Add to vault" in the owner's vault repo. Use when the owner pastes a Sync or Add-to-vault error, says Sync won't work, or reports git conflicts, divergence, "would be overwritten", authentication or "already exists" problems in the vault.
---

# Fix a failed vault Sync or Add

soii never rebases. Its Sync button runs `git pull --ff-only` in the local vault; when both sides have new commits it merges GitHub's in only if the merge is clean (D125), and otherwise shows the conflicting files or git's message. The fix is always in the **vault repo**, not in soii.

## 1. Find the vault and look before touching

```bash
VAULT=$(grep -E '^VAULT_PATH=' .env.local | cut -d= -f2-)
git -C "$VAULT" status -sb
git -C "$VAULT" log --oneline -5
git -C "$VAULT" fetch
git -C "$VAULT" log --oneline HEAD..@{u}   # on GitHub, not here
git -C "$VAULT" log --oneline @{u}..HEAD   # here, not on GitHub
```

Read only `VAULT_PATH` from `.env.local`. Never print or log any `*TOKEN*` or `*SECRET*` value.

## 2. Match the message

| Message | Cause | Fix |
|---|---|---|
| `local changes … would be overwritten by merge` | Uncommitted edits to a file that also changed on GitHub | Stash (`git stash`), pull, `git stash pop`. If the pop conflicts, go to "Conflicts". |
| `Not possible to fast-forward` / `diverging branches` | Local commits not on GitHub (soii's own commits count) and GitHub commits not here | `git pull --rebase`, resolve conflicts if any, then `git push`. |
| `Authentication failed` / `could not read Username` | The pull needs credentials soii can't prompt for | Ask the owner to run `git -C "$VAULT" pull` once in a terminal. You can't enter credentials. |
| `not a git repository` | `VAULT_PATH` isn't a clone | Fix the path in `.env.local`, or ask the owner. |
| `isn't connected to GitHub yet` / `isn't linked to GitHub yet` (Sync) | The vault has no remote (a vault made with `soii init` starts that way), or its branch tracks nothing. Nothing is broken | Ask for the repository URL (an empty one, made on GitHub), then `git -C "$VAULT" remote add origin <url> && git -C "$VAULT" push -u origin <branch>`; for a branch that tracks nothing, `git -C "$VAULT" push -u <remote> <branch>`. |
| `already exists` (Add to vault) | That title is taken; nothing was overwritten | Suggest another title, or open the existing note. No git work needed. |

## 3. Conflicts

Conflicts are rare because soii only creates new files; they need the same file edited on both sides.

1. `git -C "$VAULT" status` lists the "both modified" files.
2. For each one, show the owner both sides (the `<<<<<<<` / `=======` / `>>>>>>>` blocks) and **ask which to keep** unless the two sides are plainly independent (for example, two different lines added to a list). These are the owner's own notes. Never guess.
3. Edit the file to the agreed text, `git add <file>`, then `git rebase --continue` (or `git commit` for a merge).
4. If it goes wrong: `git rebase --abort` or `git merge --abort` restores the starting state.

## Rules

- **Never** `git push --force`, `git reset --hard`, `git checkout -- <file>`, `git clean`, or delete a branch or file in the vault without the owner's explicit yes for that exact command. Prefer `git stash` over discarding.
- Say what you're about to run and why before any command that changes the vault. Read-only commands are fine.
- Don't change soii's code to work around a vault problem unless the owner asks.
- The vault is the owner's private notes. Show the minimum of any note's content needed to resolve a conflict.

## 4. Finish

After the fix, confirm with `git -C "$VAULT" status -sb` (clean and level with `origin`), and tell the owner to press **Sync** again. It should say "Already up to date" or "Pulled the latest notes". If a conflict fix created commits, `git push` them (with the owner's okay) so GitHub and the local vault agree.
