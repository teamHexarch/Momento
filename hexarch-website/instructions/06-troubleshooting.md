# 6. Fixing common problems

These are problems the team has already run into, with the fix for each.

## "running scripts is disabled on this system" (Windows)

PowerShell is blocking npm. Run this once, type `Y` if asked, then try again:

```
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Or use `npm.cmd` instead of `npm`, or use Command Prompt instead of PowerShell.

## `'next' is not recognized` / missing module errors

The packages aren't installed, or only half-installed. In the `hexarch-website` folder, run:

```
npm install
```

## `npm error code ECONNRESET` during install

Your internet connection dropped mid-download. Run `npm install` again. If it keeps happening, turn off any VPN or switch networks (for example a phone hotspot), and run:

```
npm config set fetch-retries 5
npm config set fetch-retry-maxtimeout 120000
```

## `npm error Missing script: "dev."`

There's a typo, usually a full stop at the end. Type exactly `npm run dev`.

## localhost:3000 says "This site can't be reached"

The site isn't running. Check the terminal: if you see your normal prompt again, run `npm run dev`. If it says the port is in use, open the address it prints instead (for example `localhost:3001`).

## Warnings during `npm install`

`npm warn deprecated …` and *"16 moderate severity vulnerabilities"* are warnings, not errors, and are safe to ignore. **Never run `npm audit fix --force`**; it can break the project.

## Red error on the page after editing `content/site.ts`

You've probably removed a quote mark `"` or a comma `,`. Press `Ctrl + Z` until it works again, then redo the edit carefully.

## Merge conflict

Two people changed the same lines. VS Code shows the file with both versions marked:

1. Open the file. You'll see **Current Change** (yours) and **Incoming Change** (theirs).
2. Click **Accept Current**, **Accept Incoming** or **Accept Both**, whichever is right. If unsure, choose **Accept Both** and tidy it up by hand.
3. Save the file, then in Source Control click **+** next to it, then **Commit** and **Sync**.
4. Still stuck? Don't delete anything. Ask in the group chat first.

## The live site didn't update

- Run `npm run build` on your computer. If it shows errors, fix them, commit and sync again.
- If GitHub isn't connected to Vercel yet, someone with Vercel access needs to run `npx vercel --prod` (see guide 4).

## Nothing here helps

Take a screenshot of the error and share it in the group chat, or paste it to Claude Code and ask what it means.
