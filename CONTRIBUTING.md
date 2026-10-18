# Contributing

## This repository is a release mirror

soii is developed in a private repository. This one, `westsoever/soiisauce`, is where each release is published: one
commit per version, the same tag as the release, and nothing else. So the history here is not where work happens, and
a pull request can't be merged into it as it stands.

- **Issues are welcome.** A bug, a rough edge, an idea, a question. Use the templates; they ask for what is needed to
  reproduce a bug.
- **Pull requests may be re-applied upstream.** Open one if you've got a fix or a feature ready: the maintainer reads
  it, and if it fits, applies it in the private repository, where it ships in a later release. The pull request is then
  closed with a link to that release. If it doesn't fit, you'll be told why. Keep it small and focused, with a test.
- **Security problems are not issues.** See [SECURITY.md](SECURITY.md).

## Running it from a checkout

You need [Bun](https://bun.sh) 1.2 or newer and git.

```bash
bun install
VAULT_PATH=$PWD/template bun run dev   # http://localhost:13390, with the sample vault
```

`soii install` is how people normally run it (see [docs/setup.md](docs/setup.md)); `bun run dev` is the development
mode, on its own port so it never collides with an installed one. Like the installed one it has no sign-in, so it
listens on localhost only.

## Before you open a pull request

```bash
bun test app scripts    # the tests
bun run typecheck       # tsc over app/ and scripts/
```

Both must pass. A few tests that belong to the maintainer's release tooling don't exist in this mirror, so the suite
here is a little smaller than upstream's.

- Match the code around yours: names, comment density, the way the nearby code is written.
- A change in behaviour comes with a test that failed before it. Server code is tested through `createSoiiApp` and
  scripted `git`; see `app/server/*.test.ts` for the pattern.
- The look of the app is described in [DESIGN.md](DESIGN.md).
- Don't put names, paths or notes of your own in a test or a screenshot. Use the sample vault in `template/`.

By contributing you agree that your contribution is released under the [MIT license](LICENSE).
