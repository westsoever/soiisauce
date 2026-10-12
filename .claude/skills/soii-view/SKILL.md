---
name: soii-view
description: Create, re-filter, re-sort or remove a view (a tab) in soii from a plain description, like "a board of my sci-fi books by status in Library" or "a table of my TechBBQ contacts in People". Maps your words to the types, fields and values your vault actually uses, previews the notes it would show, suggests an existing tab when one already shows mostly the same notes, and only saves after you say so. Question-shaped requests ("who haven't I seen in a while?") get an answer in chat instead of a new tab, so soii doesn't fill up with one-off views. Writes only soii.config.yml, one local commit per change. Use when the owner says "make a view", "add a tab", "I want a view of", "filter this tab", "sort this tab by", "remove the tab", or types /soii-view.
---

# soii view

You turn what the owner describes into a view in soii, or change one. A view is a tab in `soii.config.yml`: a layout, a **filter** (which notes are in it) and a **sort** (the order they're in). Keep those two apart in everything you say.

Hard rules:
- You change views **only through `soii view`** (add, filter, sort, remove). Never edit `soii.config.yml` yourself. If `soii view` refuses, show its message and fix the draft.
- Only `soii.config.yml` changes. Never a note. One commit per change; never push.
- New views go into a workspace the owner already has. You never create a workspace.

## 1. Find the vault

The vault is the current directory (`.soii/` or `soii.config.yml` is there). In soii's own repo, ask whether to use `template/`, and pass `--vault template` to every `soii view` command. If `soii` isn't on PATH, use `bun .soii/soii/bin/soii.ts` (or `bun bin/soii.ts` in the repo).

Run `soii view list` once to see the workspaces and their tabs.

## 2. Is this a question or a view?

- **A question** ("who…", "which…", "how many…", "show me…"): build the filter (step 3), run `soii view preview <workspace> --tab '<json>' --json`, and answer in chat: the count and the notes as a short list. Save nothing and don't ask anything. End the answer with one line: `Say "make it a view" if you want this as a tab.` The exception is wording that says "view", "tab" or "always", or is clearly recurring ("a board of…", "every week show me…"): answer, then ask once **Just this once / Keep it as a view** (AskUserQuestion), and only on "Keep it" go on to step 4.
- **A view** ("a board of…", "a tab for…", "make a view…", "always show me…"): go on.
- **A change** to an existing tab ("sort Network by last seen", "only active ones in Board", "remove the Inbox tab"): go to step 6.

## 3. Build the filter from the vault's own words

Run `soii view fields --json` (add `--type <type>` once you know the type). Map the owner's words to what's really there:
- "books", "films", "people" → a `type` from `types` ("sci-fi books" → `type: book`).
- Subjects and lists → `category` / `collection` values, using the vault's spelling ("sci-fi" → `Science Fiction` if that's how the notes write it).
- "read", "active", "want to" → `status` values present in the notes.
- `#tags` → `tag`. A folder → `path: "<folder>/**"`.

If a word maps to nothing, say so and offer the closest values. If the workspace or the filter is unclear, ask **one** question.

**Not possible yet:** date ranges ("not seen in 90 days", "finished this year"). Filters match exact values only. Say so plainly, answer once from `preview` if that helps, and don't save an approximation.

A tab draft is JSON:
```json
{ "title": "Sci-fi books", "view": "board", "query": { "type": "book", "where": { "category": "Science Fiction" } }, "sort": [{ "field": "title", "dir": "asc" }], "options": { "groupBy": "status" } }
```
Layouts: `list` (option `subtitle`), `table` (`columns`), `gallery`, `board` (`groupBy`, `groups`), and for owners who ask for them `stats` (tiles), `pulse`, `feed`, `showcase`. Options for each are in `docs/workspaces.md` of the soii repo (in a vault: `.soii/soii/docs/workspaces.md`). Several OR groups are a list of clauses: `"query": [{…}, {…}]`.

## 4. Preview, and reuse before adding

Run `soii view preview <workspace> --tab '<json>' --json`.
- If `similar` isn't empty, offer the existing tab first: "*Network* already shows mostly the same notes (86%). Use that, or change its sort?" with **Use that / Change its sort / Add anyway**. "Use that" ends here with the tab's URL; "Change its sort" goes to step 6.
- Show the owner the YAML you'll add (the draft as YAML, in a code block) and the preview line ("Matches 23 notes: Dune, Hyperion, …"), then ask **Add it / Change something / Cancel**.

## 5. Add

`soii view add <workspace> --tab '<json>'`. Print the URL it returns (`http://localhost:5011/#/<workspace>/<tab>`). The running soii picks it up within seconds.

## 6. Change or remove an existing tab

Find the tab in `soii view list`. Confirm before every change, in these words:
- **Filter** (which notes are in it): build the new query (step 3), then `soii view filter <workspace> <tab> --query '<json>'`. Report the change in the set: "Network: 31 → 18 notes."
- **Sort** (the order only): `soii view sort <workspace> <tab> --sort '[{"field":"lastSeen","dir":"desc"}]'`. Say that the notes stay the same and only the order changes. `[]` returns to the default order.
- **Remove**: `soii view remove <workspace> <tab>`. Mention that git can undo it. A workspace's last tab can't be removed.
- **Layout or columns**: add the new version first (its id gets `-2`), then remove the old one, so it works on a workspace's only tab too. Say that the tab's address changes (`#/<workspace>/<new id>`). Show the before and after YAML as a diff first, and do both only after a yes.

When a tab belongs to a built-in workspace the owner never customised (People, Library…), the first change copies that whole workspace into `soii.config.yml`. Say so in one line before the first such change.

## 7. Report

One line per change made, with the tab URL. Nothing else.
