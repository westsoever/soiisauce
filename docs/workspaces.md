# Customising Finance, People and Goals

soii ships with Finance, People and Goals workspaces that work from frontmatter alone (see `docs/frontmatter.md`). To change them, add a `soii.config.yml` at your vault root.

**One rule to know:** a workspace in your config with the same `id` as a default **replaces the whole default workspace**. Copy every tab you want to keep, not just the one you change.

Option names are checked. A misspelt key (say `groupby` instead of `groupBy`) shows an inline error naming it on that tab, instead of being ignored.

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
| **Network** | `relationship` mentor, investor, techbbq, aiesec, volt or oasis, or `circle: network`, with LinkedIn |
| **Contacts** | Everyone with `type: person` |

Tabs are filters, so one person can be in Friends and Network at once. Give someone `circle: [friends, network]` to put them in both regardless of their relationship.

### Logging interactions

soii works out **last seen** for every person when the vault compiles. It's the newest of `last_contact` and any list item in the note that starts with a date:

```markdown
## Notes & dated interactions
- 2026-09-24: dinner at Mikkeller
- **2026-10-03**: call about the TechBBQ budget
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
          cadence: { friend: 30, partner: 30, family: 30, flatmate: 30, mentor: 60, investor: 60, techbbq: 90, aiesec: 90, volt: 90, oasis: 90 }
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
          - { type: person, where: { relationship: [mentor, investor, techbbq, aiesec, volt, oasis] } }
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
| `groups` | Fixed column order. Listed columns show even when empty, and other values follow alphabetically. |
| `yearField` | Field read first when `groupBy: year` (default `year`). |
| `subtitle` | Field shown under each card title. |

A numeric `progress` (0–100, `40%` works too) draws a progress bar on the card. Notes without the grouped field land in the last column, "No status" / "No year".

## Library

### Library browsing

In the Library workspace, gallery tabs get a toolbar: Sections (collections), Subcategories (categories), status chips (Want/Reading/Read; Watchlist/Watching/Watched for films and videos; only statuses present are shown), Has my notes, Grid/List and S/M/L. Grouped views show each group as a shelf of its first few notes with **Show all N**; notes without a collection are their own **No collection** section. Filters are in the URL (`?c=startupbooks&cat=biographies&s=read&notes=1`), so a filtered view can be bookmarked; grid/list and size are remembered per tab on each device. There, the toolbar's grouping replaces `groupBy`.

### Recipes and Journal

**Recipes** (`type: recipe`) uses the `showcase` view: the picture first, then the title and a short description, in two columns on wider screens. The picture is 4:5 and as tall as a book cover in the M grid. It reads `image`/`cover` like covers do, and the description from `description`, else the start of the note.

| Key | Meaning |
|---|---|
| `image` | Field holding the picture (default: `cover`, `image`, `poster` or `thumbnail`). |
| `title` | Field shown as the title (default: the note title). |
| `subtitle` | Field shown under the title, e.g. `time`. |
| `description` | Field shown as the description (default `description`, else the note's excerpt). |

**Journal** (`type: video-log`) holds the transcripts of your recorded video log entries, one day at a time with the newest first, like the Today feeds. It uses its own type because many vaults already map daily notes to `journal`.
