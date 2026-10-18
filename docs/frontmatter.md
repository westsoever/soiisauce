# Note conventions

soii reads ordinary Obsidian notes. Workspaces pick notes up by their frontmatter `type` (and sometimes their folder or tags). **Every field is optional.** An empty tab tells you what it's looking for.

## Types soii knows

`type:` is case-insensitive, and each canonical type accepts aliases:

| Canonical | Also accepted |
|---|---|
| `book` | `books` |
| `audiobook` | `audio-book` |
| `movie` | `film` |
| `documentary` | `docu` |
| `video` | `youtube` |
| `research` | `paper`, `article-research` |
| `article` | `clipping` |
| `recipe` | `recipie`, `recipes` |
| `video-log` | `vlog`, `video-journal` |
| `person` | `people`, `contact` |
| `goal` | `bucket`, `bucket-list` |
| `account` | `finance-account` |
| `subscription` | — |
| `expense` | `purchase` |
| `daily-brief` | `daily-report`, `morning-briefing` |
| `weekly-review` | `weekly-report`, `weekly-synthesis` |

## Fields per type

| Type | Fields |
|---|---|
| book, audiobook | `title, author, cover, isbn, status (want/reading/finished/abandoned), rating (1–5), started, finished, narrator` (audiobook), `collection, category` |
| movie, documentary | `title, director, year, cover, status (watchlist/watched), rating, watched, collection, category` |
| video | `title, url, channel, cover, watched, collection, category` |
| research | `title, authors, year, venue, url, doi, arxiv, status (to-read/reading/read), collection, category` |
| article | `title, url, author, collection, category` |
| recipe | `title, image, description, source, collection, category` (cover works for the picture too) |
| video-log | `title, date, video`; the transcript is the note body |
| person | `relationship, company, role, email, phone, location, last_contact, birthday, linkedin, cadence (days, weekly/monthly/quarterly/yearly, or never), circle (friends/network)` |
| goal | `horizon (year/life/bucket), year, status (idea/active/done/dropped), area, due, progress (0–100)` |
| subscription | `price, currency, cycle (weekly/monthly/yearly), renews, status (active/paused/cancelled)` |
| account | `institution, balance, currency, as_of` |
| expense | `amount, currency (DKK/EUR…), category, date, paid_with` |
| daily-brief, weekly-review | `date`, or a `YYYY-MM-DD` file name |

Example:

```yaml
---
type: book
author: Frank Herbert
cover: "[[dune-cover.jpg]]"   # or an https:// URL
status: finished
rating: 5
finished: 2026-03-01
---
```

**Dates** are `YYYY-MM-DD`. **Images** (`cover`, `image`, `poster`, `thumbnail`) are a URL or a vault file. Quote `"[[file.png]]"`, though soii also understands the unquoted form. Numbers like `price: "25,00 kr."` are read leniently.

Quote titles that contain ` #` (a space, then `#`): YAML reads it as the start of a comment and drops the rest, e.g. `title: "Ægir's Saga #1"`.

## Collections and categories

One field per job:

| Field | Job | Shape | Example |
|---|---|---|---|
| `type` | what the note is | string | `book` |
| `collection` | which list or source it belongs to (a Library **section**) | list | `[ReadingList]` |
| `category` | its subject (a **subcategory**) | list, usually one | `[Biographies]` |
| `tags` | free cross-cutting labels only | list | `[founder-mindset]` |

Without `collection`, soii uses a tag that names a folder in the note's path below its Library folder, else that nearest folder (`Books/ReadingList/…` → ReadingList). A note with neither is in the **No collection** section. A missing `category` is **Uncategorized**. Values are matched case-insensitively and shown humanised (`ReadingList` → "Reading List"); the files are never rewritten. Log and Add write both as block lists (the same style as the rest of the vault), at most 5 values of at most 60 characters. The Log shows them up front for every Library kind.

"Has my notes" in the Library means the body has any words outside headings: a single line of text counts, a bare `# Title` or an empty template does not.

## Notes made with the Log

The Log always creates a new note, in the folder for its kind (a plain Note goes to `00-Inbox`). The text you write is the body under the `# Title`; for a person it is one dated bullet under `## Notes & dated interactions`, and longer text continues on indented lines under the same bullet. Fields you fill in (a book's status, a rating) go into the frontmatter. A Note needs no title: with none, the first line of the text becomes it and is not repeated below. If a note with that name exists, the new one is saved as `Name 2`; nothing is overwritten or appended to.

## Hiding a note

`soii: hidden` or `publish: false` in the frontmatter keeps a note out of soii entirely.

These forms all hide a note, whatever the capitalisation and with or without quotes: `soii: hidden` (also `Hidden`, `"hidden"`) and `publish: false` (also `False`, `FALSE`, `"false"`, `'false'`, `no`). Both keys are lowercase.

If a hidden note's frontmatter has a YAML typo, soii **still keeps it out**. It can't read the rest of the frontmatter, but it can still see the hidden line, so the note is skipped and the build prints a warning ("skipped, it is marked hidden but its frontmatter can't be read"). When in doubt, soii leaves the note out rather than showing it.

## Private comments

Obsidian hides `%%like this%%` and `<!-- like this -->` in reading view, and people use them for private notes-to-self. soii treats them the same way: the text is removed before anything is built, so it never appears in the reader, in search, or in excerpts. (Comments inside code blocks and inline code are real code, so they stay.)

## Excluding folders

`exclude` in `soii.config.yml` (below) lists globs for paths soii never reads. They match the path from the vault root, ignoring case.

- These exclude a folder with everything in it: `Private`, `Private/` and `Private/**` (the top-level `Private` folder), and `**/Private` (a folder called `Private` at any depth).
- Any other pattern with a wildcard in its last segment matches files only, never folders: `*` (files at the vault root), `*.md`, `**/_*` and `Priv*`. So `**/_*` leaves `_attachments/` in place and only drops the files inside it whose names start with `_`. To drop folders by a wildcard, end the pattern with `/**`, as in `Priv*/**`.

To keep a single note out, use `soii: hidden` instead. Hidden notes and private comments are already covered above, under "Hiding a note" and "Private comments".

## `soii.config.yml`

Optional, at the vault root. It's merged over the built-in defaults:

```yaml
title: My brain
home: library                 # workspace opened at "/"
exclude: ["**/Templates/**", "Private/**"]
obsidianVault: my-notes      # only if your Obsidian vault name differs from the folder/repo name
types:
  book: [book, books, novel]  # replaces the default alias list for "book"
workspaces:
  - id: library               # same id as a default → replaces it
    title: Library
    icon: books
    tabs:
      - id: books
        title: Books
        view: gallery
        query: { type: book }
        sort: [{ field: finished, dir: desc }]
  - id: recipes               # new id → added after the defaults
    title: Recipes
    tabs:
      - { id: all, title: All, view: list, query: { tag: recipe } }
```

- **Views:** `list`, `table`, `gallery`, `board`, `stats`, `feed`, `pulse`.
- **Query keys:** `type`, `path` (globs), `tag`, `where` (frontmatter equals). A list of clauses means "any of".
- `replaceDefaultWorkspaces: true` drops the built-in workspaces.

## Editing in Obsidian

Reading a note in soii never changes it: to edit its text, use Obsidian (or any editor). What soii itself writes is small and explicit: Log, Add and property edits become local git commits (see [setup.md](setup.md#writing-from-soii-and-sync)). A note you open has an **Open in Obsidian** button at the right of the reader's top bar. The Today feeds (Daily brief, Weekly review) show only **Open note**, which goes to the reader. The button opens the note through an `obsidian://open?vault=…&file=…` link. The vault name is the vault's folder name (`VAULT_PATH`). Set `obsidianVault` if your Obsidian vault is called something else. Known issue: Vivaldi (8.2.x, macOS) crashes when the same note's button is clicked a second time. That's a Vivaldi bug, not soii's.

An open soii page checks for a new build every 5 seconds while it's visible, and when you switch back to it, then refreshes in place. soii rebuilds about a second after you save, so the page catches up within about 6 seconds.

## Covers in the Library

soii picks a cover for each book, audiobook, movie, documentary and video in this order:

1. **Your own image**: `cover`, `image`, `poster` or `thumbnail` in frontmatter. A full `https://` URL, or a file in your vault (`cover: covers/dune.jpg` or `cover: "[[dune.jpg]]"`).
2. **Automatic lookup** when none is set:
   - **Books & audiobooks:** Google Books by `isbn`; without an ISBN, or when the ISBN finds nothing, by `title` + `author`. Google's shared keyless quota runs out quickly, so set `GOOGLE_BOOKS_API_KEY` for reliable covers; without it, books fall back to the title tile once the quota is gone.
   - **Movies & documentaries:** TMDB by `title` + `year` (or the year from `released` / `release_date`). Needs `TMDB_API_KEY` (a v3 key or a v4 read token).
   - **Videos:** the YouTube thumbnail for `url`. No key needed. Other video sites get a title tile.
3. **Title tile**: a typographic card in your workspace's font when nothing is found.

Lookups go through your soii's `/api/cover` endpoint. It only answers URLs that soii itself signed, and your browser keeps a found cover for a day, so an item isn't looked up on every page view.

Gallery tabs accept these `options` in `soii.config.yml`:

```yaml
options:
  image: cover_url      # frontmatter field holding the image (default: the cover chosen above)
  title: title          # field for the card title (default: note title)
  subtitle: author      # default: author (books), year (films), channel (videos)
  badge: status         # default: status for books and audiobooks
  aspect: poster        # poster | square | video
  groupBy: status       # optional sections
```

Research notes show their links (`url`, `doi`, `arxiv`) above the body. Books with an `isbn` get a Google Books link.

## Fill in the properties

`bun scripts/vault-normalise.ts <vault>` adds the keys above to every typed note: each missing key as an empty key, plus the few values that can be worked out safely (`author` from a `Title — Author` file name, `last_contact` from the newest dated line, `cadence` from the relationship, `created` from git). It never overwrites a value or guesses a status, rating or amount, and it changes nothing without `--write`. `/soii-setup` runs it for you.

## Check your vault

`bun scripts/check-vault.ts /path/to/vault` lists the notes soii can't read properly. It only reads, never writes, and follows the vault's `soii.config.yml` (its `exclude`, `types` and workspaces). Hidden and excluded notes are skipped.

| Severity | Rule | What it means |
|---|---|---|
| error | `frontmatter-invalid` | The frontmatter isn't valid YAML, or isn't `key: value` pairs, so the note shows no properties |
| error | `base64-note` | The whole file is base64 text (usually an agent wrote the encoded payload) |
| error | `config-invalid` | `soii.config.yml` doesn't parse or doesn't match the schema |
| warning | `unknown-type` | A `type` that isn't a type above, an alias, or one your config adds |
| warning | `enum-value` | A value outside the lists in [Fields per type](#fields-per-type), such as a book `status`, a goal `horizon`, a subscription `cycle`, a person's `circle` or `cadence` |
| warning | `date-format` | A date field (`started`, `finished`, `due`, `renews`, `last_contact`, `birthday`…) that isn't `YYYY-MM-DD` |
| warning | `number-format` | `rating` (1–5), `progress` (0–100), `price`, `balance`, `amount`, `pages` or `year` that isn't a number |
| warning | `broken-link` | `[[wikilinks]]` to notes or files that don't exist, listed per note |
| warning | `duplicate-note` | Two files with the same note id (`Dup.md` and `Dup.MD`); soii keeps the first |
| info | `enum-case` | A value that only differs in capitalisation (`Finished`). soii reads it, but lowercase is the documented form |
| info | `missing-type` | A note without `type` in a folder where most notes have the same one ("probably `type: book`") |
| info | `missing-field` | A typed note lacks some of the keys [Fields per type](#fields-per-type) lists for its type (`title` aside: soii takes that from the file name). An empty `rating:` counts as there. The report summarises these per type; `--json` lists every note |

Each finding names the file, the rule and, when the fix is obvious, the line to write (`finished: 2026-03-01`). Add `--json` for a machine-readable list (for agents). The command exits with 1 when there are errors, else 0.
