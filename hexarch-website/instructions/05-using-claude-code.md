# 5. Using Claude Code

Claude Code can make changes for you: you describe what you want, and it edits the files. It needs a paid Claude plan (Pro or above).

## Install it

1. In VS Code, press `Ctrl + Shift + X`, search **Claude Code**, and install the one published by **Anthropic**.
2. Make sure you've opened the **`hexarch-website`** folder (File → Open Folder).
3. Click the Claude icon in the top right of the editor and sign in with your Claude account.

## It already knows the rules

`CLAUDE.md` in the `hexarch-website` folder holds the project's design rules, section order and content rules. Claude Code reads it automatically every time, so you don't need to explain the project.

## Good ways to ask

- *"Add Chelsea's photo from public/team/chelsea.jpg and set her role to Designer."*
- *"Make the FAQ answers slightly larger on mobile."*
- *"Add a new FAQ question: … with the answer: …"*
- *"Run npm run lint and npm run build, and fix anything that fails."*

Ask for one change at a time, and look at the result in the browser before asking for the next.

## Stay safe

- **One Claude session per folder at a time.** Two sessions editing the same folder overwrite each other's work. This has happened to us before.
- **Sync before you start, commit and sync when you finish**, just like editing by hand (guide 2).
- **Read what it changed** before committing. Source Control shows every file and line it touched.
- If it suggests inventing team members, quotes, numbers or logos, say no. Only real content goes on the site.

Next: [Fixing common problems](06-troubleshooting.md)
