---
name: soii-portfolio
description: Interviews the owner about their ideal portfolio, career and skill set, then writes it into the vault as a project with a vision, a skill map (each skill now, needed, and where current work can train it), a first step and a deadline. Every question and answer is kept in a dated interview note, with why each question is asked, so the process can later be retold as a guide or course. Resumes where the last session stopped. Use when the owner says "interview me about my portfolio", "dream portfolio", "map my skills", "where do I want my career to go", "what should I train next", or types /soii-portfolio.
---

# Portfolio interview

The owner answers; you ask. Never answer a question for them, never fill a gap with a guess. One question at a time, in plain words. When an answer is vague ("something creative"), ask one follow-up for an example before moving on.

## 1. Find or start the project

Ask what the project is called (default "Portfolio") and look for it in `02-Projects/` (or the vault's projects folder: where existing `type: project` notes live).

- **It exists:** read the project note and every `Interview - *.md` in its folder. Say which rounds below are done, and start at the first one that isn't. Rounds the owner wants to redo are redone; the old answers stay in the old interview note.
- **It doesn't:** propose `02-Projects/<slug>/<Title>.md` and create it after the owner's yes, with the sections from step 3 empty.

Start today's interview note, `Interview - YYYY-MM-DD.md`, in the same folder (a second session on the same day appends to it).

## 2. The interview

Six rounds. A round ends with a short read-back in the owner's words; they correct it, then you write it (step 3) before the next round. The owner can say "pause" at any time: write what you have and stop.

1. **The picture.** In an ideal scenario, five to ten years out: what work do you do, for whom, and where? What is in your portfolio (projects, products, writing, talks, clients)? What do people say about you when you aren't in the room? How are you paid?
2. **Proof.** Which three to five pieces of work would make that portfolio undeniable? For each: what it is, who sees it, and how they'd know it is good.
3. **Skills.** Which skills does the picture need? For each: where you are now and where you need to be (0 none · 1 basic · 2 solid · 3 known for it), and what shows it today. Ask; don't rate for them.
4. **Today.** What do you do now: job, clients, projects, side things, communities? Read the vault's active projects and areas first and ask about them by name, so the owner doesn't list from memory.
5. **Training ground.** For each skill with a gap: which work from round 4 can train it, and how (take the role, ship the piece, write about it)? Where nothing trains it, say so; that's a gap to fill with new work.
6. **First step and deadline.** The one smallest step that moves the portfolio forward, and a date. Then the deadline for the project as a whole, if the owner wants one.

## 3. What to write

**The project note.** Use the layout of the vault's existing project notes (title line, map line, section order). Properties: `type: project`, `status: active`, `area` if the owner names one, `created`, and `due` from round 6. Sections:

- `## Vision`: round 1, in the owner's words.
- `## Proof`: round 2, one bullet per piece.
- `## Skill map`: a table with columns Skill · Now · Needed · Trained by. Rounds 3 and 5 fill it.
- `## Plan`: `- [ ]` lines: round 6's first step with its date, then one per training-ground action from round 5.
- `## Log`: `- YYYY-MM-DD: interview, rounds 1–3` per session.

**The interview note.** Frontmatter `created` and `tags: [interview]`, a link to the project note, then per round a `## Round N: <name>` heading with:

- each question asked and the answer, as said (light cleanup of filler words only);
- a `Why this question:` line in one sentence: what the round is for. This is what makes the session reusable as a guide or course later.

## 4. Close

Show the files changed and make one local commit (`portfolio: <project>, interview rounds N–M`). Never push; Sync does that. Then offer next steps, without starting them:

- research on how others built the portfolio and reputation in the picture (`/research` if the vault has it, or `/soii-explore`);
- a later session to redo round 3 once the training is under way.

## Rules

- The owner's words go in the notes. Don't upgrade, summarise away or add skills, ratings, dates or ambitions they didn't say.
- Add only: new notes, new lines, filled empty sections. Never rewrite an earlier interview note.
- New notes follow the vault's own rules (its `CLAUDE.md` or `AGENTS.md`) where they are stricter than this skill.
- These are private notes. When you report, show paths, not the answers.
