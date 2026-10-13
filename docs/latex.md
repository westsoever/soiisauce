# LaTeX files in soii

soii shows `.tex` files from your vault as PDFs. Click one in the folder tree, search or a workspace, and soii compiles it and shows the result. **Source** shows the LaTeX itself. Edit the file in Obsidian or any editor; reopening it in soii compiles the new version.

## What you need

A LaTeX compiler on the machine that runs soii. soii looks for, in order:

1. `tectonic`, a single small program that fetches the packages a document needs: `brew install tectonic`
2. `pdflatex`, `xelatex` or `lualatex` from MacTeX or TeX Live

It checks your `PATH`, then `/Library/TeX/texbin`, `/opt/homebrew/bin`, `/usr/local/bin` and `/usr/bin`. With none installed, the reader shows the source and says how to install one.

Which engine: a `% !TEX program = xelatex` (or `lualatex`, `pdflatex`) line near the top wins. Otherwise a document that loads `fontspec` or `unicode-math` uses `xelatex`, and everything else uses `pdflatex`.

## How it compiles

- In the file's own folder, so `\input{chapter}`, `\includegraphics{figure.png}` and a `.bib` next to it work.
- With shell escape turned off completely. soii passes `-no-shell-escape` (or `--untrusted` to tectonic), which also disables the short list of "safe" commands TeX allows by default, so `\write18` runs nothing.
- For at most 30 seconds. A document that runs longer is stopped.
- With bibtex between passes when the document has `\bibliography{…}`.

## Where the files go

Nothing is written next to your `.tex`. The PDF and LaTeX's helper files live in `<vault>/.soii/cache/tex/`, which git ignores. Reopening an unchanged file serves the cached PDF instantly. Changing the file, or anything else in its folder, compiles again. Deleting `.soii/cache/` is always safe.

## Limits

Local mode only (`soii run`). No editing, no live preview, no SyncTeX. Each `.tex` is compiled on its own: a chapter without `\documentclass` shows LaTeX's error. A tectonic first run downloads packages and may hit the 30-second limit; **Try again** continues where it left off.
