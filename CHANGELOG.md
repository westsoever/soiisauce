# Changelog

What's new in each soii release, newest first. `soii update` prints the sections that are newer than the version you had.

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
