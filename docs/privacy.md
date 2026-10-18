# Privacy

soii runs on your computer and reads your vault from disk. Only your own computer can reach it. It has no account, no analytics and no telemetry, and it never uploads your notes.

To do a few of its jobs, soii asks the internet for something. This page lists every case, what goes out, and how to turn it off.

## What soii asks for on its own

| What | Who it asks | What they see | When |
|------|-------------|---------------|------|
| Exchange rates for the Finance currency switch | [Frankfurter](https://frankfurter.dev) (`api.frankfurter.dev`, European Central Bank rates) | Your IP address. Nothing from your vault. | At most every 12 hours, while soii is open |
| Book covers | Google Books (`www.googleapis.com`), then your browser loads the picture from `books.google.com` | The ISBN, or the title and author, of the book on the card | When a Library card without a `cover` is shown |
| Film and documentary posters | TMDB (`api.themoviedb.org`, only if you set `TMDB_API_KEY`), then your browser loads the picture from `image.tmdb.org` | The title and year | When such a card is shown |
| Video thumbnails | Your browser loads the picture from YouTube (`i.ytimg.com`) | Which video | When a video card is shown |
| "Update available" | GitHub (`git ls-remote` on `github.com/westsoever/soiisauce`) | Your IP address | When soii starts, every 6 hours, and after a Sync |

Images inside your notes that point to the web (a clipped article's pictures, say) are loaded by your browser from wherever they live, the same as in Obsidian.

## What happens only when you ask

- **Sync** pulls from your vault's git remote, then pushes your commits that aren't there yet. Nothing else goes anywhere.
- **`soii install` and `soii update`** download soii from GitHub and its packages from the npm registry.
- **The Claude skills** (`/soii-explore`, `/unbox`, `/soii-learn` and the rest) run in Claude Code. Claude Code sends your conversation, and the notes a skill reads, to Anthropic. `/soii-explore` and `/unbox` also search and fetch web pages.

## Turning it off

Add this line to `.soii/.env.local` in your vault (create the file if it isn't there), then run `soii restart`:

```bash
SOII_OFFLINE=1
```

Offline, soii asks for nothing on its own:

- the currency switch uses the rates built into soii;
- cards show their title tile instead of a looked-up cover (a `cover` image stored in your vault still shows);
- there is no update check. `soii update` still works when you run it;
- images inside your notes that point to the web don't load (images stored in your vault still do).

The fonts are part of soii, so nothing changes there. Sync, install and update still do what you ask.
