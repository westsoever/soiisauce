# Customising Finance, People, Goals and Projects

soii ships with Finance, People, Goals and Projects workspaces that work from frontmatter alone (see `docs/frontmatter.md`). To change them, add a `soii.config.yml` at your vault root.

## Adding views without YAML

- **In soii:** the **+** next to a workspace's tabs opens **New view**: a title, a layout (list, table, gallery or board), a filter (which notes are in the view) and a sort (the order they're shown in), with a live preview. The **⋯** next to it changes the current tab's filter or sort, or removes it.
- **In Claude Code:** `/soii-view` turns a description into a view, and can use every layout and option on this page.

Both write a tab into `soii.config.yml` and make a commit in your local vault. The first change to a built-in workspace (Library, People, Finance, Goals, Projects, Backlog) copies the whole workspace into your config, following the rule below.

**One rule to know:** a workspace in your config with the same `id` as a default **replaces the whole default workspace**. Copy every tab you want to keep, not just the one you change.

Option names are checked. A misspelt key (say `groupby` instead of `groupBy`) shows an inline error naming it on that tab, instead of being ignored.

## Inbox

**Inbox** is the first workspace in the sidebar, above Today. It is a single list of every note under `00-Inbox/`, subfolders included (a `clippings/` folder, say), newest first. "Newest" is the note's `date`, then its `created` property, then a date in its file name. Notes with none of those go to the bottom.

It reads that folder and nothing else, so a note leaves the list when you file it somewhere else. soii doesn't track read or unread: the list is what is in the folder.

Vaults with a differently named inbox folder can point it elsewhere. A workspace with `id: inbox` in your `soii.config.yml` replaces this one, whole:

```yaml
workspaces:
  - id: inbox
    title: Inbox
    icon: inbox
    tabs:
      - { id: inbox, title: Inbox, view: list, query: { path: "Unsorted/**" } }
```

## Projects

**Projects** is a board of every note with `type: project`, in three columns by `status`: `idea`, `active` and `done`. Other status values get a column of their own, and notes with no status go in a last **No status** column. Each card shows the project's `area` under its title.

```markdown
---
type: project
status: active
area: Home
---
# Balcony garden
```

A project with `parent: "[[Other project]]"` is a subproject. It stays on the board like any project, with a "↳ Parent" link on its card (and "1 of 3 subprojects done" on the parent's card), and the parent's page lists its subprojects (see [frontmatter.md](frontmatter.md#subprojects)).

Only the note that stands for the project needs the type (one per project folder, say), so plans, transcripts and other files next to it stay off the board. To add tabs, such as a list of a project folder's notes, give your config a workspace with `id: projects`. It replaces this one whole, so repeat the Board tab in it.

## Finance

soii reads numbers from frontmatter only. **Tables inside a note's body are not parsed.** A note like "Subscription Overview" with a markdown table still shows up under Finance → Notes, but it won't feed the Overview tiles. To get tiles, give each subscription its own small note.

Before (one note, one table row):

```markdown
| 1 | **iCloud+ (200 GB)** | 25,00 kr. | Monthly | July 3, 2026 | Aug 3, 2026 |
```

After (`03-Areas/Finance/Subscriptions/icloud.md`):

```markdown
---
type: subscription
title: iCloud+ (200 GB)
price: 25,00 kr.
currency: DKK
cycle: monthly
renews: 2026-08-03
status: active
---
Manage at https://apps.apple.com/account/subscriptions
```

Prices can be written the way you'd write them: `25,00 kr.`, `$96.00`, `1,234.56` and `12.500,00` are all understood. Values soii can't read (`n/a`) aren't counted, and the tile says how many were left out.

### Showing everything in one currency

Above the Overview and any table with a currency column there is a switch: **EUR**, **DKK**, any other currency your notes use, and **As entered**. Pick one and every tile, chart and price is converted to it. In tables the written amount stays visible in brackets. **As entered** shows each currency on its own again. Your choice is remembered in this browser.

Rates come from the ECB (through the free Frankfurter API), are fetched by soii at most twice a day, and the switch says which day they are from. If they can't be fetched, soii uses rough built-in rates and says "approximate rates". All amounts use today's rate, not the rate on the day of the entry. A note with no `currency`, or a currency soii has no rate for, is not counted, and the tile says how many were left out.

To choose the starting currency, or to pin your own rates (units per 1 EUR, which win over the live ones), add this to `soii.config.yml`:

```yaml
currency:
  display: DKK
  rates: { USD: 1.08 }
```

A custom overview with an extra billing cycle and a chart:

```yaml
workspaces:
  - id: finance
    title: Finance
    icon: coins
    tabs:
      - id: overview
        title: Overview
        view: stats
        query: [{ type: subscription }, { type: account }]
        options:
          tiles:
            - label: Monthly subscriptions
              agg: sum
              field: price
              type: subscription
              where: { status: active }
              normalize: { field: cycle, factors: { weekly: 4.33, monthly: 1, semester: 0.1667, yearly: 0.0833 } }
              groupBy: currency
              format: currency
            - { label: Active subscriptions, agg: count, type: subscription, where: { status: active } }
            - { label: Net balance, agg: sum, field: balance, type: account, groupBy: currency, format: currency }
          chart: { kind: bar, groupBy: cycle, agg: count, label: Subscriptions by cycle }
      - id: subscriptions
        title: Subscriptions
        view: table
        query: { type: subscription }
        options: { columns: [title, { field: price, format: currency }, currency, cycle, { field: renews, format: date }, status] }
      - id: accounts
        title: Accounts
        view: table
        query: { type: account }
        options: { columns: [title, institution, { field: balance, format: currency }, currency] }
      - id: notes
        title: Notes
        view: list
        query: [{ tag: finance }, { path: "**/Finance/**" }]
```

### Tile reference

| Key | Meaning |
|---|---|
| `label` | Tile title. With `groupBy`, each tile is titled `label · group`. |
| `agg` | `count`, `sum`, `avg`, `min` or `max`. Everything except `count` needs `field`. |
| `field` | Frontmatter field (or a note property like `date`) to aggregate. |
| `type`, `where` | Narrow the tab's notes further, with the same rules as tab queries. |
| `groupBy` | One tile per distinct value, e.g. `currency`. |
| `normalize` | Multiply each value by `factors[<value of field>]`. A note whose value has no factor isn't counted. |
| `format` | `number` or `currency`. If you leave it out and the notes have a `currency`, the tile formats as currency. |

soii never adds different currencies together. If a tile's notes use more than one currency, it shows one tile per currency even without `groupBy`.

`chart` takes `kind: bar`, `groupBy`, `agg`, optional `field`, and `label`. It shows at most 12 bars; the rest are folded into "Other".

## People

People has four tabs out of the box:

| Tab | Shows |
|---|---|
| **Overview** | Who you've been in touch with and who you should reach out to |
| **Friends** | `relationship` friend, partner, family or flatmate, or `circle: friends` |
| **Network** | `relationship` mentor or investor, or `circle: network`, with LinkedIn |
| **Contacts** | Everyone with `type: person` |

Tabs are filters, so one person can be in Friends and Network at once. Give someone `circle: [friends, network]` to put them in both regardless of their relationship.

### Logging interactions

soii works out **last seen** for every person when the vault compiles. It's the newest of `last_contact` and any list item in the note that starts with a date:

```markdown
## Notes & dated interactions
- 2026-09-24: dinner at Mikkeller
- **2026-10-03**: call about the book club budget
```

Future dates (planned meetings) don't count. Dates inside `%% comments %%` don't count either.

### Who to reach out to

The Overview lists people whose last-seen date is older than their **cadence** (most overdue for their cadence first), then people with a cadence but nothing logged. A cadence comes from the person's `relationship`, or from the note itself:

```yaml
cadence: 14         # days; also weekly, monthly, quarterly, yearly
cadence: never      # stop the reminders; they stay in Contacts
linkedin: anna-berg # or a full linkedin.com URL
```

You don't have to edit YAML for this. On a person's page, **Edit → Reach out** is a picker (weekly, fortnightly, monthly, quarterly, yearly, never). When you set someone's `relationship` in soii, their relationship's default (monthly for a friend) is written into the note once; after that the note's own `cadence` wins, and changing the relationship later leaves it alone. A person without a `cadence` just follows their relationship's default, shown as "default" in their header.

The default cadences are in the Overview tab's options. To change them, copy the whole People workspace from below into `soii.config.yml`:

```yaml
  - id: people
    title: People
    icon: users
    tabs:
      - id: overview
        title: Overview
        view: pulse
        query: { type: person }
        options:
          cadence: { friend: 30, partner: 30, family: 30, flatmate: 30, mentor: 60, investor: 60 }
          recentDays: 30   # the "Recently in touch" window
          limit: 10        # rows before "Show all"
      - id: friends
        title: Friends
        view: list
        query:
          - { type: person, where: { relationship: [friend, partner, family, flatmate] } }
          - { type: person, where: { circle: friends } }
        sort: [{ field: lastSeen, dir: desc }, { field: title, dir: asc }]
        options: { subtitle: relationship }
      - id: network
        title: Network
        view: table
        query:
          - { type: person, where: { relationship: [mentor, investor] } }
          - { type: person, where: { circle: network } }
        sort: [{ field: lastSeen, dir: desc }, { field: title, dir: asc }]
        options: { columns: [title, relationship, company, role, { field: linkedin, label: LinkedIn }, lastSeen] }
      - id: all
        title: Contacts
        view: table
        query: { type: person }
        sort: [{ field: title, dir: asc }]
        options: { columns: [title, relationship, company, location, lastSeen] }
```

Relationships missing from `cadence` (contact, vendor, …) get no reminders unless the note sets one. The Overview also lists birthdays in the next 30 days, skipping anyone with `cadence: never`.

Opening a person note shows a header with initials, relationship, work, location, last seen, email/phone/LinkedIn links and a birthday countdown (within 30 days). `birthday` can be `1994-10-16` or `--10-16` (no year). Any other text is shown as written, without a countdown.

## Goals

```yaml
  - id: goals
    title: Goals
    icon: target
    tabs:
      - id: board
        title: Board
        view: board
        query: { type: goal }
        options: { groupBy: status, groups: [idea, active, done, dropped], subtitle: area }
      - id: years
        title: By year
        view: board
        query: { type: goal }
        options: { groupBy: year, yearField: target_year }
      - id: bucket
        title: Bucket list
        view: list
        query: { type: goal, where: { horizon: [life, bucket] } }
```

### Board reference

| Key | Meaning |
|---|---|
| `groupBy` | Field whose values become columns (default `status`). `year` is special: it reads `yearField`, then `due`, then the note date. |
| `groups` | Fixed column order, named as written here. Listed columns show even when empty, and other values follow alphabetically. |
| `yearField` | Field read first when `groupBy: year` (default `year`). |
| `subtitle` | Field shown under each card title. |
| `fallback` | Column for notes with no value, or (with `groups`) a value that isn't listed. Without it they get columns of their own. |
| `badges` | Fields shown as badges on each card. |
| `flag` | Field that, when it has text, is shown on the card as a warning (`blocked`), with a quick filter chip. |
| `links` | Fields shown as links at the bottom of a card: a URL opens in a new tab (`PR #42` for a pull request), a `[[wikilink]]` opens that note, other text is shown as written. |
| `filters` | Fields to filter by, one dropdown each, with a count per value. `{ field: lane, none: Needs triage }` also names the "no value" choice and adds it as a quick chip. Filters are in the URL (`?lane=&kind=task`; an empty value means "none"). |
| `move` | `true` lets you move cards between columns, by dragging or with a card's **Move to** menu. Each move writes `groupBy` into the note. Needs a vault soii can write to; not with `groupBy: year`. |
| `stamp` | Column → date field, e.g. `{ done: done }`: moving a card into that column sets the field to today, moving it out clears it, and cards in that column show the date. |

A numeric `progress` (0–100, `40%` works too) draws a progress bar on the card. A daily goal also sets `progress_day: YYYY-MM-DD`, the day that progress is for: on any later day the card shows 0% until the goal is logged again. Notes without the grouped field land in the last column, "No status" / "No year", unless there is a `fallback`.

## Backlog

**Backlog** is a board of every note in `04-Resources/Backlog/`, the folder `/unbox` parks tasks, job posts and "check this out" links in. Backlog notes have no `type`, so the board picks them by folder. It has four columns by `status`: `backlog`, `doing`, `done` and `dropped`. A note with no `status`, or one soii doesn't know, is shown under `backlog`.

```markdown
---
status: doing
kind: task          # job, check-out, task or idea
lane: research      # research, build or hold (hold: it needs you); empty means untriaged
blocked: login wall
issue: ABC-16
pr: https://github.com/you/repo/pull/42
result: "[[What came out of it]]"
source: todoist
created: 2026-10-14
---
# Compare course providers
```

Every field is optional. A card shows the title, its `kind`, a `lane` badge, the `blocked` reason, and links to the `issue`, `pr` and `result`. Above the board, filter by lane, kind and source, or tap **Needs triage** (no lane) or **Blocked**.

Drag a card to another column, or use its **Move to** menu (on a phone, too), and soii writes the new `status` into the note as a local commit. Moving a card into **done** also sets `done:` to today, and the done column shows that date, newest first; moving it out again clears `done:`. On a vault soii can't write to, the board is read-only.

To use another folder, or change the columns, give your config a workspace with `id: backlog`. It replaces this one whole:

```yaml
  - id: backlog
    title: Backlog
    icon: kanban
    tabs:
      - id: board
        title: Board
        view: board
        query: { path: "Tasks/**" }
        sort: [{ field: done, dir: desc }, { field: created, dir: desc }, { field: title, dir: asc }]
        options:
          groupBy: status
          groups: [backlog, doing, done, dropped]
          fallback: backlog
          subtitle: kind
          badges: [lane]
          flag: blocked
          links: [issue, pr, result]
          filters: [{ field: lane, none: Needs triage }, kind, source]
          move: true
          stamp: { done: done }
```

## Tasks

**Tasks** is the task system that people and agents share: one note per task in `03-Areas/Tasks/`, open ones in `backlog/` and finished ones in `completed/`. Like Backlog, it picks notes by folder, not by `type`. It has three tabs:

| Tab | Shows |
|---|---|
| **All** | A board of every task, in five columns by `status`: `todo`, `in_progress`, `blocked`, `review` and `done`. A note with no `status`, or one soii doesn't know, is shown under `todo`. |
| **Review** | Tasks with `status: review`: finished by whoever owns them and waiting for you to approve. Newest `updated` first. |
| **Done** | Tasks with `status: done`, newest `done` date first. |

```markdown
---
id: "0042"
title: Add login tests
status: review
owner: agent:builder      # human:<name> or agent:<name>; empty means unclaimed
priority: 2               # 1 (urgent) to 5 (someday)
created: 2026-10-14
updated: 2026-10-19
pr: https://github.com/you/repo/pull/42
---
# Add login tests
```

On the board, open tasks are sorted by `priority`, then oldest `created` first, the order an agent picks them in. A card shows the `owner`, a `lane` badge, the `blocked` reason, and links to the `issue`, `pr` and `result`; above the board, filter by owner, lane and kind. Moving a card writes its `status` as a local commit, and moving it into **done** sets `done:` to today, as on the Backlog board. soii doesn't move the file from `backlog/` to `completed/`: both folders are in every tab.

To use another folder, or other columns, give your config a workspace with `id: tasks`. It replaces this one whole, so repeat every tab you want to keep (the defaults are in `app/lib/default-config.ts`).

## Capacity

**Capacity** shows how full your week is, as a % of what you can sustain, against the line you want to run at (80% by default). Above the line is a push, fine for a while; above 100% there is no slack left. It adds up notes the other workspaces already read, so most of it needs nothing new:

| Input | Counts | Weight |
|---|---|---|
| Active projects | `type: project` with `status: active` | 15% each. A project's own `load:` replaces it. |
| Backlog in progress | `04-Resources/Backlog/` notes with `status: doing` | 5% each, or the note's `load:` |
| Inbox | notes in `00-Inbox/` | 1% each |
| Meetings, next 7 days | `meetings:` on the capacity note, in hours | 2% per hour (100% is about 50 hours) |
| Fixed load | `base:` on the capacity note, as a % (a day job, say) | as written |
| Accepted leaks | `type: leak` with `verdict: accept` | each leak's own `cost:` |

Each row lists the notes it counted, so you can see why. Above them, the bar has a second line, **Expected by Sunday**, and under it two sections:

- **What is causing this** names the three biggest inputs and how much of the load each is. It then lists what is assumed by the end of the week, and only what your notes say: a counted note whose `due:` date falls in the rest of the week is finished, and the Inbox is filed (the weekly habit). Meetings, the fixed load and accepted leaks stay as they are. With nothing dated, the expected load is today's.
- **To reach 80% by the end of the week** lists what to cut, cheapest first: file the Inbox, move work in progress back to the backlog (or finish it), fix a leak, decline meeting hours, and only then pause a project. Within a kind the biggest comes first, so the fewest actions get there, and each line shows where the week lands. When everything it can cut still isn't enough, it says so, for example when a large fixed load is the cause.

Below them:

- **A new project?** answers for a typical project (the Active projects weight): yes under the line, "only as a short push" up to 100%, and "not now" above it. If the capacity note has `checklist: "[[Your checklist]]"`, a button opens it.
- **How full was today?** is one tap a day, 1 to 10 (8 is the line). soii writes it into `felt:` on the capacity note, with the day's score next to it (`"2026-10-21: felt 8, score 89%"`), as one local commit. The last week is listed, and when a day felt 20 or more points away from its score, soii says so: a weight is off, or there is a leak.
- **Leaks** is a second tab: a table of every `type: leak` note (see [frontmatter.md](frontmatter.md#capacity-and-leaks)).

The capacity note is optional, and it is the one place to tune the workspace without YAML. Any `type: capacity` note works:

```markdown
---
type: capacity
target: 80            # the line
ceiling: 100
base: 20              # % of the week outside the vault
meetings:
  - "2026-10-21: 17.5"  # hours in the next 7 days; the newest line counts, for 7 days
felt:
  - "2026-10-21: felt 8, score 96%"
weight_projects: 10   # weight_<input id> overrides an input's weight
checklist: "[[New project - yes or no]]"
---
# Capacity
```

A `meetings` line older than seven days isn't counted, and the row says so. Without a capacity note, meetings and the fixed load show as "not counted" and the 1–10 row is off.

The outlook has two options on the view (`outlook:`, both optional): `clear` lists the input ids assumed empty by the end of the week (default `[requests]`, the Inbox; use `[]` if you don't file it weekly), and `dueField` names the date field that ends a note (default `due`). The advice covers the built-in input ids (`requests`, `doing`, `leaks`, `meetings`, `projects`); inputs you add still count in the load.

To count other notes, give your config a workspace with `id: capacity` (it replaces this one whole, so repeat the Leaks tab). Each input has an `id`, a `label`, a `weight` and either a `query` (count notes; `field` names a note's own number that replaces the weight) or a `value` (a field on the capacity note: a number, or dated lines). `unit` and `hint` are for display.

```yaml
  - id: capacity
    title: Capacity
    icon: gauge
    tabs:
      - id: load
        title: Load
        view: capacity
        query: { type: capacity }
        options:
          target: 80
          ceiling: 100
          newProject: projects   # the input whose weight one more project costs
          maxAgeDays: 7          # dated values older than this aren't counted
          inputs:
            - { id: projects, label: Active projects, query: { type: project, where: { status: active } }, weight: 15, field: load }
            - { id: clients, label: Client work, query: { type: client, where: { status: active } }, weight: 20 }
            - { id: meetings, label: Meetings, value: meetings, weight: 2, unit: h }
      - id: leaks
        title: Leaks
        view: table
        query: { type: leak }
        options: { columns: [title, verdict, { field: cost, label: Cost (% a day) }, fix] }
```

## Library

### Library browsing

In the Library workspace, gallery tabs get a toolbar: Sections (collections), Subcategories (categories), status chips (Want/Reading/Read; Watchlist/Watching/Watched for films and videos; only statuses present are shown), Has my notes, Grid/List and S/M/L. Grouped views show each group as a shelf of its first few notes with **Show all N**; notes without a collection are their own **No collection** section. Filters are in the URL (`?c=readinglist&cat=biographies&s=read&notes=1`), so a filtered view can be bookmarked; grid/list and size are remembered per tab on each device. There, the toolbar's grouping replaces `groupBy`.

### Recipes and Journal

**Recipes** (`type: recipe`) uses the `showcase` view: the picture first, then the title and a short description, in two columns on wider screens. The picture is 4:5 and as tall as a book cover in the M grid. It reads `image`/`cover` like covers do, and the description from `description`, else the start of the note.

| Key | Meaning |
|---|---|
| `image` | Field holding the picture (default: `cover`, `image`, `poster` or `thumbnail`). |
| `title` | Field shown as the title (default: the note title). |
| `subtitle` | Field shown under the title, e.g. `time`. |
| `description` | Field shown as the description (default `description`, else the note's excerpt). |

**Journal** (`type: video-log`) holds the transcripts of your recorded video log entries, one day at a time with the newest first, like the Today feeds. It uses its own type because many vaults already map daily notes to `journal`.
