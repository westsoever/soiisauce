---
name: skillfactory
description: Turns a process into a reusable Claude Code skill. The owner describes a workflow, or points at one that just happened in this session, and skillfactory works out the trigger, steps, inputs, outputs and hard rules, writes .claude/skills/<name>/SKILL.md in the repo the session is in (the vault for vault owners, the soii repo for soii's own skills) in the house style with a strong description, adds it to the repo's cheatsheet (docs/skills.md in soii, .claude/SKILLS.md in a vault) if one exists, and commits. Refuses to overwrite an existing skill without an explicit yes. Use when the owner says "make this a skill", "turn what we just did into a command", "I keep doing this, automate it", or types /skillfactory.
---

# skillfactory

Turns a repeatable process into a skill file the owner can run with `/name`. The skill goes into **the repo this session is in**: `.claude/skills/<name>/SKILL.md`.

Hard rules:
- **Never overwrite an existing skill without an explicit yes** (show a diff first). Never touch other skills.
- Never put secrets, tokens, absolute personal paths or a person's private details into a skill. Skills get shared and copied.
- The skill you write must work with the current directory as the repo root, and use relative paths.
- Add files only: the new skill folder, one cheatsheet row, one commit. No pushes. Never `push --force` or `reset --hard`.

## 1. Where am I

```bash
git rev-parse --show-toplevel
ls .claude/skills 2>/dev/null
ls docs/skills.md .claude/SKILLS.md 2>/dev/null
```

- Repo has `scripts/check-vault.ts` and `docs/skills.md`: it's **soii itself**. The cheatsheet is `docs/skills.md`.
- Has `.obsidian/` or `soii.config.yml`: a **vault**. The cheatsheet is `.claude/SKILLS.md` if it exists (else none; don't create one unless the owner asks).
- No git repo: say so, write the skill anyway, and skip the commit.

## 2. Get the process

Either the owner describes it, or it is something that **just happened in this session** ("make that a skill"). In the second case, reconstruct it from the conversation: what triggered it, the commands and files used, the decisions the owner made along the way. Don't ask for what you can read.

Fill in this list, asking one question at a time with AskUserQuestion where it is a choice, and in plain text where it is open:

1. **Name.** Lowercase, hyphenated, short. In soii's repo use the `soii-` prefix, except for tools that aren't about a vault. In a vault, any name that doesn't start with `soii-` (that prefix is soii's, and `soii update` overwrites those folders).
2. **Trigger.** When should Claude pick this up? Real phrases the owner would say. This becomes the `description`.
3. **Inputs.** What it needs (a note, a topic, a date) and what it can find on its own.
4. **Steps.** 3 to 8 steps, concrete: exact commands, exact files, what to show before writing.
5. **Outputs.** What changes (files, commits) and what it prints.
6. **Hard rules.** What it must never do: notes are private, no deletes, ask before writes, no pushes. Anything the owner said "never" about during the session.
7. **Tools.** Only what the steps need (shell, Read/Edit/Write, WebSearch/WebFetch, AskUserQuestion).

Summarise it back in five lines and ask **Looks right / Change something**.

## 3. Check for a clash

```bash
test -e .claude/skills/<name>/SKILL.md && echo EXISTS
```

If it exists: show the first 15 lines, then ask **Overwrite / Pick another name / Cancel**. Only an explicit **Overwrite** continues. Even then, write the new text and show `git diff` afterwards.

## 4. Write the skill

`.claude/skills/<name>/SKILL.md`, in the house style:

```markdown
---
name: <name>
description: <what it does, in one or two sentences, then "Use when the owner says ..." with real trigger phrases, then "or types /<name>".>
---

# <Title>

<One paragraph: what this does and when. Plain words.>

Hard rules:
- <the never-do list; always include the privacy line for skills that read notes>

## 1. <First step>
<Exact commands in code blocks. What to show the owner before writing.>

## 2. ...

## N. Report
<What to print at the end: short.>
```

The house style:
- `name:` is exactly the folder name, and the file starts with `---` on the first line then `name: <name>`. Anything else and the skill isn't found.
- The `description` is the trigger. Write it so Claude would pick the skill from a casual request: say what it does, what it changes, and the phrases that should trigger it. It's one line in YAML: if it contains `: ` quote the whole thing.
- Plain-spoken, second person to Claude ("You check..."), short steps, exact commands, no filler.
- State hard rules near the top. Say what it shows before it writes, and that it asks first.
- Work with the repo root as the working directory. In a vault, soii's scripts are at `.soii/soii/scripts/`; in soii's repo, `scripts/`.
- Aim for under 150 lines. If a step needs a long reference, say where it lives (`docs/frontmatter.md`) instead of copying it.

If the skill is a vault skill (not soii's own), don't mention soii's internals beyond what it needs.

## 5. Add it to the cheatsheet

If the cheatsheet exists, add **one row** in the table that matches its columns, starting with `` | `/<name>` | ``, in the section where it fits (read the file; keep the order the others use). In soii the columns are *Command, When to use it, What it does, Changes*. Don't edit other rows. If there is no cheatsheet, skip this step and say so.

In soii's repo, `bun test scripts` must pass afterwards (it checks every skill has a row).

## 6. Commit

```bash
git add -- .claude/skills/<name> <cheatsheet if changed>
git commit -m "skill: add /<name>" -m "<one line: what it does>"
```

Add the commit trailer your environment asks for. Don't push.

## 7. Report

Print the path, the description, and: "Try it: `/<name>`". If it was built from this session, mention which steps you took from the conversation so the owner can check them. If the skill is in a vault, remind them that skills in `.claude/skills/` named `soii-*` are managed by soii and overwritten on update; theirs aren't.
