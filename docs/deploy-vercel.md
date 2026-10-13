# Deploy soii to Vercel (optional)

The normal way to run soii is on your own computer, at `http://localhost:5011` ([setup.md](setup.md)). Deploy to Vercel only if you want soii reachable from your phone or another computer: it then runs as your own Vercel project, reads your Obsidian vault from a GitHub repo, and signs you in with GitHub. Allow about 20 minutes. Each step says exactly where to click.

**You need:** a GitHub account, your vault in a GitHub repo (private is strongly recommended), and a Vercel account.

The Vercel setup and the local install are independent. You can have both: your vault pushes to GitHub, the local soii pulls and pushes with **Sync**, and the deployed one rebuilds from every push.

## 1. Fork or clone soii

Fork `westsoever/soii` on GitHub, or clone it and push it to a repo of your own. (The repo is private: ask for access first.)

## 2. Create the Vercel project

1. In Vercel, click **Add New… → Project** and import your soii repo.
2. Leave **Framework Preset** on "Other". `vercel.json` sets the build.
3. Don't deploy yet. Click **Environment Variables** first (step 5).

## 3. Create a GitHub OAuth App (for sign-in)

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. **Homepage URL:** `https://<your-project>.vercel.app`
3. **Authorization callback URL:** `https://<your-project>.vercel.app/api/auth/callback`
4. Create it. Copy the **Client ID**, then click **Generate a new client secret** and copy it.

## 4. Create a read-only token for your vault

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access:** *Only select repositories* → your vault repo.
3. **Permissions → Repository permissions → Contents:** *Read-only*. Nothing else.
4. Set an expiry you'll remember, generate it, and copy the token.

## 5. Set the environment variables in Vercel

Project → **Settings → Environment Variables**, for **Production** and **Preview**:

| Name | Value |
|---|---|
| `VAULT_REPO` | `your-github-name/your-vault-repo` |
| `VAULT_TOKEN` | the token from step 4 |
| `VAULT_REF` | your vault's branch, usually `main` |
| `GITHUB_CLIENT_ID` | from step 3 |
| `GITHUB_CLIENT_SECRET` | from step 3 |
| `SOII_ALLOWED_GITHUB_LOGINS` | your GitHub login (comma-separate several) |
| `SOII_SESSION_SECRET` | output of `openssl rand -base64 48` |
| `GOOGLE_BOOKS_API_KEY` | *recommended*, for book covers (see below) |
| `TMDB_API_KEY` | *optional*, for movie and documentary posters (see below) |

**`GOOGLE_BOOKS_API_KEY` (recommended).** Google's shared keyless quota runs out quickly, and then book covers fall back to title tiles. In [Google Cloud Console](https://console.cloud.google.com/) create or pick a project, enable **APIs & Services → Library → Books API**, then **Credentials → Create credentials → API key**, and paste it here.

A bare cover lookup isn't remembered between views. To look each book up once and write the answer into the note, see "Book covers" in [setup.md](setup.md).

**`TMDB_API_KEY` (optional).** Without it, movies and documentaries show a title tile. Make a free account at themoviedb.org, open **Settings → API**, and copy the v3 API key (or the v4 read token).

## 6. Deploy

Click **Deploy**. When it finishes, open the URL. You should see **soii.** with "Continue with GitHub". If you see "Missing configuration" instead, it lists exactly which variables to fix. Fix them, then redeploy.

## 7. Create a Deploy Hook

Project → **Settings → Git → Deploy Hooks** → name `vault`, branch `main` → **Create Hook**. Copy the URL.

## 8. Make vault pushes redeploy soii

1. In your vault repo, create `.github/workflows/soii-deploy.yml` with the contents of [`templates/vault-workflow.yml`](../templates/vault-workflow.yml). (A vault made with `soii init` doesn't include this workflow: without the secret below it would fail on every push.)
2. Vault repo → **Settings → Secrets and variables → Actions → New repository secret**: name `SOII_DEPLOY_HOOK_URL`, value = the hook URL from step 7.

## 9. Push to your vault and watch it update

Edit any note, commit, push. In the vault repo's **Actions** tab, "Deploy soii" turns green, and a new deployment appears in Vercel. About two minutes later the change is live. Reload soii.

## 10. Add soii to your phone's home screen

- **iPhone (Safari):** open soii, tap **Share → Add to Home Screen**.
- **Android (Chrome):** open soii, tap **⋮ → Add to Home screen**.

## Optional: add notes from soii

Each Library tab has an **Add book / movie / …** button. It builds the note with its frontmatter. **Copy** and **Download** always work. **Add to vault** appears once writing is set up:

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Only select repositories** → your vault repo. **Contents: Read and write**. Nothing else.
3. Add it as `VAULT_WRITE_TOKEN` in Vercel (and in `.soii/.env.local` for the local install). Keep `VAULT_TOKEN` read-only: it's a different token with a different job.

"Add to vault" commits the note to `VAULT_REF` (`main`) under `04-Resources/Library/<Books|Audiobooks|Movies|Documentaries|Videos|Research|Articles>/`. The folder is created by the first note. An existing note is never overwritten. The vault workflow from step 8 then redeploys soii, so the note shows up about two minutes later.

On Vercel, **Sync** isn't available (there is no local vault to pull); the redeploy from step 8 does that job.

### Log

**Log** (the ＋ in the phone's bottom bar, or **Log** in the sidebar) is the quick way in: pick what it is (Conversation, Person, Book, Movie, Goal, Expense, Note, or More…), pick the note or start a new one, tap a few chips, write, **Log it**.

- Logging something that exists adds a dated line to it: `- 2026-10-12 (call) — what you wrote`. People get it under `## Notes & dated interactions`, so the People overview's "last seen" updates; everything else gets it under `## Log`.
- New notes go to: people `05-Knowledge/People/`, goals `03-Areas/Goals/`, expenses `03-Areas/Finance/Expenses/`, notes `00-Inbox/`, books and films the Library folders.
- With `VAULT_WRITE_TOKEN`, every Log is a commit on `VAULT_REF`. On Vercel it shows up after the redeploy (about 2 minutes).
- What you type is kept on the device until the commit succeeds, so a bad connection loses nothing.

## Custom settings, light and dark

`soii.config.yml` in your vault works the same here as locally: see [frontmatter.md](frontmatter.md). soii follows your device's light or dark setting.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build log: `Couldn't clone https://***@github.com/…` | Check `VAULT_REPO` spelling, that the token can read that repo, and that it hasn't expired. |
| Build log: `soii.config.yml: …` | Fix the named line in your vault's `soii.config.yml`. |
| Login screen: "@you isn't on this soii's allowlist" | Add your login to `SOII_ALLOWED_GITHUB_LOGINS` and redeploy. |
| Sign-in loops back with "link expired" | Make sure the OAuth App callback URL matches your domain exactly. |
| Vault pushes don't redeploy | Check the vault repo's Actions tab, and that the `SOII_DEPLOY_HOOK_URL` secret exists. |
