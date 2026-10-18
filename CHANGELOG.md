# Changelog

What's new in each soii release, newest first. `soii update` prints the sections that are newer than the version you had.

## v0.2.5

soii has a new speed reader, a Log button that always starts a new note, and a clearer install. Captures are named after their first line, and Sync can now merge a vault that has diverged cleanly.

- A new speed reader at `/speed`: paste in a text, set the words per minute, and read it one word at a time.
- The Log button always creates a new note, with the cursor ready to type.
- The first line of an Option-P or `/soii-capture` note is its title and file name; the rest is the body.
- When your vault and GitHub have both moved on and the changes don't clash, Sync merges them instead of stopping.
- Sync asks before its first push to a new remote, and says plainly when the vault isn't connected to GitHub.
- `/unbox` clips pages with Defuddle instead of WebFetch.
- The one-line install no longer hangs on macOS, and its messages for a missing git identity or PATH say the exact fix.
- A new `SOII_OFFLINE=1` setting means soii asks for nothing on its own (see the privacy page).
- Fixed an endless rebuild loop when a note links a large attachment.
- On Linux, `soii run` notices newly added skill folders.

## v0.2.4

Press Option-P anywhere in soii to jot a thought straight into your Inbox, without leaving what you're doing.

- Option-P opens a small capture box. Enter saves, Shift-Enter starts a new line, Esc closes it, and what you'd typed is still there when you open it again.
- The note lands in your Inbox in the same format as /soii-capture, named after today's date and its first words. An existing note is never overwritten, and Sync pushes it like anything else you add.

## v0.2.3

Inbox now comes first in the sidebar, and "Save with text" in /soii-explore keeps the whole page instead of a summary.

- The sidebar reads Inbox, Today, Library. "00 Inbox" is now just "Inbox". soii still opens on Today.
- "Save with text" in /soii-explore saves the full page into the note (text, links and images) the way the Obsidian Web Clipper does, with the clipper's properties. Pages that block it get a link and a short summary instead.

## v0.2.2

The one-line install checks your Bun first and shows its progress.

- If your Bun is older than 1.2, the install stops straight away and tells you how to update it (`bun upgrade`, or `brew upgrade bun`), instead of failing later with an error that doesn't say why.
- While it installs soii's packages you see the progress, so a first install that takes a minute doesn't look stuck.

## v0.2.1

A fix for the one-line install: on a first run it could stop with "Cannot find module 'unist-util-visit-parents/do-not-use-color'". It now installs soii's packages before it starts.

- The one-line install sets up soii's packages first, so it works on a computer that has never run soii.
- An update or install that can't download soii's packages (no internet, for instance) now changes nothing: the soii you have keeps working, and the message says to try again.

## v0.2.0

soii is now open source under the MIT licence, and installing it takes one line in a terminal: no GitHub account and no access to ask for. New vaults start empty, with sample notes only if you want them, and soii can show LaTeX files as PDFs.

- Install with one line: `curl -fsSL https://raw.githubusercontent.com/westsoever/soiisauce/main/install.sh | bash`.
- Updates now come from the public repo, westsoever/soiisauce. Your vault switches over by itself with this update.
- New vaults start empty: just the folders and the templates. Say yes to the sample notes during install, or run `soii init --samples`, to see soii filled in.
- `.tex` files open as compiled PDFs, with a switch to see the source. This needs LaTeX installed on your computer.
- Finance shows every amount in one currency you choose, converted with daily exchange rates.
- Two new built-in workspaces: 00 Inbox, with everything that lands in your inbox, newest first, and Projects.
- New skill: `/unbox` files everything in your Inbox where it belongs.
- People and the Log form no longer come with preset groups; the Log offers the relationships your own contacts already have.
- soii runs only on your own computer now. The option to host it on Vercel is gone.
