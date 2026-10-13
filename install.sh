#!/usr/bin/env bash
# install.sh: install soii from a terminal, with no AI and no clone to remember (D113).
#
#   curl -fsSL https://raw.githubusercontent.com/westsoever/soiisauce/main/install.sh | bash
#
# It checks that git, Bun and GitHub can be reached (and prints the exact fix if not), clones soii to a temporary folder,
# runs `soii install` (the plain-questions wizard), and deletes the clone. `soii install` keeps its own pinned copy in
# <vault>/.soii/soii, so nothing here is needed afterwards.
#
# Anything after `bash -s --` goes to soii: `... | bash -s -- --no-service`, `... | bash -s -- init ~/my-vault`.
# Environment, for testing: SOII_REPO (owner/name), SOII_CLONE_URL (replaces the GitHub URL), SOII_REF (branch or tag),
# SOII_TTY (the keyboard device, /dev/tty).
set -euo pipefail

REPO="${SOII_REPO:-westsoever/soiisauce}"
URL="${SOII_CLONE_URL:-https://github.com/$REPO.git}"
REF="${SOII_REF:-}"
TTY="${SOII_TTY:-/dev/tty}"
FETCH_HINT='Check that this computer is online and can reach github.com, then run this again. (A private fork of soii? Run `gh auth login` and then `gh auth setup-git` once so git can read it.)'

say() { printf '%s\n' "$*"; }
die() { printf 'soii install: %s\n' "$*" >&2; exit 1; }

# A terminal to ask questions on. Piped into bash, stdin is this script, so use the keyboard (/dev/tty) instead.
have_tty() { (: <"$TTY") 2>/dev/null; }

# The command: install (default), or init/setup when it is the first word.
cmd=install
case "${1:-}" in
  init | setup | install) cmd="$1"; shift ;;
esac

# Without a terminal, only a run that never asks (a vault path, --yes, or init with a folder) can go on.
asks=1
if [ "$cmd" = init ]; then asks=0; fi
for a in "$@"; do
  case "$a" in
    --yes | -y) asks=0 ;;
  esac
done
if [ "$cmd" = install ] && [ "${1:-}" != "" ] && [ "${1#-}" = "$1" ]; then asks=0; fi
if [ "$asks" = 1 ] && [ ! -t 0 ] && ! have_tty; then
  die "there is no terminal to ask questions on. Run it in a terminal, or name the vault: ... | bash -s -- ~/my-vault --yes"
fi

# 1. Prerequisites. Collect every problem so one run shows them all.
problems=()
command -v git >/dev/null 2>&1 || problems+=("git is missing. On a Mac: xcode-select --install   (Linux: your package manager, e.g. apt install git)")

if ! command -v bun >/dev/null 2>&1; then
  if [ -x "$HOME/.bun/bin/bun" ]; then
    export PATH="$HOME/.bun/bin:$PATH"
  elif [ "$asks" = 1 ] && have_tty; then
    printf 'soii needs Bun (https://bun.sh) and it is not installed. Install it now? [y/N] ' > "$TTY"
    answer=""
    read -r answer < "$TTY" || answer=""
    case "$answer" in
      y | Y | yes | YES)
        command -v curl >/dev/null 2>&1 || die "curl is missing, so Bun can't be installed for you. Install Bun from https://bun.sh and run this again."
        curl -fsSL https://bun.sh/install | bash || die "Bun's installer failed. Install Bun from https://bun.sh and run this again."
        export PATH="$HOME/.bun/bin:$PATH"
        ;;
    esac
  fi
  command -v bun >/dev/null 2>&1 || problems+=("Bun is missing. Install it with: curl -fsSL https://bun.sh/install | bash   (then open a new terminal)")
fi

# An older Bun can't read soii's lockfile or load its packages, and fails later with errors that don't say why.
MIN_BUN="1.2.0"
# True when version $1 is older than $2, compared number by number (1.10 is newer than 1.9). Plain bash, no other tools.
older_than() {
  local IFS=. i
  local a=(${1%%[-+]*}) b=($2)
  for i in 0 1 2; do
    [ "${a[i]:-0}" -lt "${b[i]:-0}" ] 2>/dev/null && return 0
    [ "${a[i]:-0}" -gt "${b[i]:-0}" ] 2>/dev/null && return 1
  done
  return 1
}
if command -v bun >/dev/null 2>&1; then
  have_bun="$(bun --version 2>/dev/null)"
  if older_than "$have_bun" "$MIN_BUN"; then
    problems+=("Bun $have_bun is too old for soii, which needs Bun $MIN_BUN or newer. Update it with: bun upgrade   (or brew upgrade bun, if Homebrew installed it)")
  fi
fi

if command -v git >/dev/null 2>&1; then
  # Ask git itself: this is the one check that is true whichever way you signed in (gh, ssh, a token).
  if ! GIT_TERMINAL_PROMPT=0 git ls-remote --exit-code "$URL" HEAD >/dev/null 2>&1; then
    problems+=("git can't reach $URL. $FETCH_HINT")
  fi
fi

if [ "${#problems[@]}" -gt 0 ]; then
  say "soii can't be installed yet:" >&2
  for p in "${problems[@]}"; do say "  - $p" >&2; done
  exit 1
fi

# 2. A temporary clone, always removed.
tmp="$(mktemp -d "${TMPDIR:-/tmp}/soii-installer.XXXXXX")"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT
trap 'exit 130' INT TERM

say "Fetching soii..."
clone=(git clone --quiet --depth 1)
if [ -n "$REF" ]; then clone+=(--branch "$REF"); fi
GIT_TERMINAL_PROMPT=0 "${clone[@]}" "$URL" "$tmp/soii" || die "git could not fetch soii. $FETCH_HINT"

# soii's own packages, in the clone. Without node_modules Bun fetches imports from its global cache on the fly, and
# some packages (they import themselves by name) can't be loaded that way. Never from the keyboard: that's soii's.
say "Installing soii's packages (the first time this can take a minute or two)..."
# The lockfile is the lock; an older Bun that can't read it falls back to a plain install, as `soii install` does.
(cd "$tmp/soii" && { TMPDIR="$tmp" bun install --frozen-lockfile < /dev/null 2>&1 || TMPDIR="$tmp" bun install < /dev/null 2>&1; }) || die "couldn't install soii's packages (bun install failed; the lines above say why). Check that you are online, then run this again."

# 3. Hand over to soii. It asks its questions on the keyboard, and the clone is deleted when it ends.
# Not `exec`: the trap must run afterwards. Its exit code is ours.
if [ ! -t 0 ] && have_tty; then
  bun "$tmp/soii/bin/soii.ts" "$cmd" "$@" < "$TTY"
else
  bun "$tmp/soii/bin/soii.ts" "$cmd" "$@"
fi
