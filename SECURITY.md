# Security policy

## Report a vulnerability

Please report it privately, through GitHub: on this repository's **Security** tab choose **Report a vulnerability**
(<https://github.com/westsoever/soiisauce/security/advisories/new>). Don't open a public issue or pull request for it.

Say what you found, how to reproduce it, which soii version (`soii --version`) and which system. If you can, say what
an attacker would get. You'll hear back as soon as the maintainer can; this is a small project run by one person, so
there is no promised response time. A fix goes out as a normal release (`soii update`), and the advisory credits you
unless you'd rather it didn't.

## What is in scope

soii runs on your own computer, on `http://localhost:5011`, with no sign-in. What it protects is your vault and your
machine, so these are the things worth reporting:

- **The local server.** Anything that lets a web page, another site open in your browser, or another computer read or
  change your vault: DNS rebinding, cross-site requests, a way past the Host or Origin checks, listening beyond
  localhost, reading or writing outside the vault (path traversal), script that runs from note content.
- **The installer and the updater.** `install.sh`, `soii install` and `soii update`: what they download and run, what
  they write outside the vault (the `soii` command, the macOS LaunchAgent), and whether they can be steered to run
  something else.
- **Losing your notes.** Anything soii does by itself that overwrites or deletes a note or rewrites git history.
- **Leaks from this repository.** Private names, tokens or paths that ended up in a release.

## What is not

- Anything that needs you to already be running hostile code as your own user on your own computer. soii has no
  sign-in on localhost on purpose; another program running as you can read your vault without soii.
- `SOII_LOCAL_FORCE=1`. It switches the localhost-only guards off, and `.env.example` says so.
- A vault you didn't make. soii runs `git` inside the vault, with that repository's own hooks and settings, so a vault
  is as trusted as code you run. Don't point soii at one from someone you don't trust.
- Problems in a dependency that don't affect soii (report those upstream), and in services soii talks to (GitHub,
  Google Books, TMDB). Do tell us if a dependency problem does reach soii.
- Heavy use of your own computer (a huge vault is slow to build).

## How soii defends itself

- It listens on `127.0.0.1` only and refuses to start on any other address unless you force it.
- A request whose Host header isn't localhost is refused, which stops a web page from reaching it through a hostname
  it controls (DNS rebinding). Every change (add a note, Log, edit a property or view, Sync) must also come from
  soii's own page (Origin check).
- The page is served with a Content-Security-Policy that allows soii's own scripts only, and with headers that stop
  other sites framing it. Note text is rendered with raw HTML removed.
- It writes only to files it chose itself inside the vault, never replaces an existing note when adding one, and
  never force-pushes or rewrites history.

## Supported versions

Only the newest release gets fixes. `soii update` moves you to it.
