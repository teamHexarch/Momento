# 2. Everyday workflow

Follow this every time you work on the site.

## Before you start

1. Open the `hexarch-website` folder in VS Code.
2. Open **Source Control**: the branching icon on the left, or `Ctrl + Shift + G`.
3. Click **Sync Changes** (or `…` → **Pull**). This brings in everyone else's latest work.
4. In the terminal, run `npm run dev` and open http://localhost:3000.
5. Tell the group chat which file or section you're about to edit.

> If someone added a new package since you last worked, `npm run dev` may complain about a missing module. Run `npm install` once, then `npm run dev` again.

## While you work

- Save often (`Ctrl + S`) and check the browser.
- Keep each change small and about one thing, for example "update team roles".

## When you're done

1. Go back to **Source Control**. You'll see a list of the files you changed.
2. Type a short message describing what you did, for example `Add team photos`.
3. Click **Commit**. If it asks to stage all changes, click **Yes**.
4. Click **Sync Changes** to send your work to GitHub.
5. Tell the group chat you're done with that file.

## Avoiding clashes

- **One person per file at a time.** Two people editing the same file at once is what causes conflicts.
- **Sync before and after** every session.
- If VS Code says there's a **merge conflict**, don't panic and don't delete anything. See [Fixing common problems](06-troubleshooting.md#merge-conflict).

## Never commit these

The `.gitignore` file already keeps them out, so leave it in place:

- `node_modules/`: installed packages, rebuilt by `npm install`
- `.next/`: build files, rebuilt by `npm run dev`
- `.env` files: passwords and keys

Next: [Editing the site](03-editing-the-site.md)
