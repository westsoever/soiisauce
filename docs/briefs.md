# Briefs in soii

soii's **Today** workspace shows agent-written briefs as a feed: one day at a time, newest first, each rendered in full. Use the arrows (or the date list) to step back through earlier days. The address bar keeps the day you're looking at (`?d=2026-10-06`), so you can bookmark or share a specific brief. A dot on a tab means it has a note dated today, in your own timezone.

soii only reads your vault. Briefs are written by your agents, scripts or by hand; soii picks them up on the next deploy.

## How soii finds a brief

The default **Daily brief** tab shows notes that match either rule:

| Rule | Example |
|---|---|
| frontmatter `type: daily-brief` (also `daily-report`, `morning-briefing`) | `type: daily-brief` |
| the note lives in a folder called `daily_report` | `06-Wiki/daily_report/2026-10-06.md` |

The default **Weekly review** tab works the same way with `type: weekly-review` (also `weekly-report`, `weekly-synthesis`), or with a `week_report` or `week_logs` folder.

You can retitle the tabs in your own config. The example config below calls them **Brief** and **Weekly**.

## How soii dates a brief

The feed groups notes by date, in this order of preference:

1. `date:` in the frontmatter
2. `created:` in the frontmatter
3. the first `YYYY-MM-DD` in the file name

**Frontmatter wins.** `daily_report/2026-10-04.md` with `date: 2026-10-03` appears under 3 October. Notes with no date at all are left out of the feed. The feed says how many were skipped.

If your briefs carry their date in a different field, set it on the tab:

```yaml
- id: brief
  title: Daily brief
  view: feed
  query: { type: daily-brief }
  options: { dateField: published }
```

`dateField` is the only feed option. An unknown option name is reported on the tab instead of being ignored, so a typo like `dateFeild` shows up straight away.

## Recommended format for agent-written briefs

```markdown
---
type: daily-brief
date: 2026-10-06
---

**🌅 Morning Briefing — Tuesday, 06 Oct 2026**
…
```

- One file per day, named `YYYY-MM-DD.md`, in one folder (for example `06-Wiki/daily_report/`).
- Plain markdown. Tables, task lists, callouts and `[[wikilinks]]` all render. Dataview queries are shown as code, not run.
- Write markdown, **not** base64. See the known issue below.
- Weekly reviews: `type: weekly-review`, `date:` set to the last day of the week, file name `weekly-YYYY-MM-DD.md`.

Two briefs on the same date are shown together on that day, ordered by title.

## Pointing soii at an existing layout

Override the `today` workspace in your vault's `soii.config.yml`. `examples/cos.soii.config.yml` is a worked example for a vault whose briefs have no frontmatter. It matches them by folder:

```yaml
workspaces:
  - id: today
    title: Today
    icon: sun
    tabs:
      - id: brief
        title: Brief
        view: feed
        query:
          - { type: daily-brief }
          - { path: "06-Wiki/daily_report/*.md" }
```

The same example keeps your own daily notes, morning sets and evening reflections (`type: daily`, `daily-morning`, `daily-evening`) out of the brief feed. It aliases them to one `journal` type and gives them a **Journal** tab:

```yaml
types:
  journal: [journal, daily, daily-morning, daily-evening]
```

## Known vault data issue: notes stored as base64

Some agents have written a note's base64-encoded payload instead of its markdown. soii shows those notes as one long unreadable line. In the owner's vault (checked 2026-10-11) these six files are affected:

- `01-Daily/2026-07-19.md`
- `01-Daily/2026-07-31.md`
- `01-Daily/2026-08-06.md`
- `01-Daily/2026-08-08.md`
- `01-Daily/2026-08-10.md`
- `01-Daily/_Templates/daily.md`

Find them in any vault (read-only, changes nothing):

```bash
bun scripts/find-base64-notes.ts /path/to/vault
```

To repair one, decode it in the vault and commit: `base64 -d -i note.md -o note.fixed.md && mv note.fixed.md note.md`. Then find and fix the agent step that wrote it.
