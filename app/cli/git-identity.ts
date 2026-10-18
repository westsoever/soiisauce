// app/cli/git-identity.ts
// A machine where git has never been told who you are can't make commits. soii's commits then fail with a message only
// a git user understands, so say what to type, and how to save what soii couldn't.

/** Does this git output mean "git doesn't know who you are"? */
export const isIdentityProblem = (text: string): boolean =>
  /author identity unknown|tell me who you are|unable to auto-detect email|empty ident name|no (name|email) was given/i.test(text)

/** What to do, once: set a name and email, then make the commit soii couldn't. */
export function identityNote(vault: string, o: { firstCommit: boolean; message: string }): string {
  const save = o.firstCommit
    ? `git -C "${vault}" commit -m "Initial vault"`
    : `git -C "${vault}" add .soii/package.json .soii/.gitignore .soii/skills.json .claude/skills\n    git -C "${vault}" commit -m "${o.message}"`
  return `git doesn't know who you are yet, so soii couldn't save ${o.firstCommit ? 'the first commit' : "its files"} in your vault. Tell git once (your own name and email):\n\n    git config --global user.name "Your Name"\n    git config --global user.email "you@example.com"\n\nthen save it with:\n\n    ${save}`
}
