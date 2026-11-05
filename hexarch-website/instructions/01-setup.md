# 1. Set up your computer

You only do this once. It takes about 20 minutes.

## Install three tools

1. **Node.js**: download the **LTS** version from https://nodejs.org and install with the default options.
2. **Git**: download from https://git-scm.com/downloads and install.
   - On Windows, when asked for the default editor, choose **Visual Studio Code**.
   - For the default branch name, choose **Override** and keep `main`.
   - Leave everything else as the default.
3. **VS Code**: download from https://code.visualstudio.com and install.

Close and reopen any terminal windows afterwards so they find the new tools.

## Check they work

Open a terminal (in VS Code: **Terminal → New Terminal**) and run:

```
node -v
npm -v
git --version
```

Each should print a version number. Node must be 20.9 or higher.

> **Windows:** if `npm -v` says *"running scripts is disabled on this system"*, run this once, type `Y` if asked, then try again:
> ```
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

## Tell Git who you are

Use **your own** name and email, so the team can see who changed what:

```
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## Get the project

1. In VS Code, press `Ctrl + Shift + P` (Mac: `Cmd + Shift + P`), type **Git: Clone** and choose **Clone from GitHub**.
2. Sign in to GitHub with the **shared team account** when asked.
3. Pick **teamHexarch/Momento** and choose a folder on your computer, for example `Documents`.
4. When it finishes, go to **File → Open Folder** and open the **`hexarch-website`** folder inside `Momento`.
   - Open `hexarch-website` itself, not the whole `Momento` folder, or the commands below won't work.
5. If VS Code asks *"Do you trust the authors?"*, click **Yes**.

## Run the site

In VS Code's terminal (``Ctrl + ` ``), run:

```
npm install
npm run dev
```

- `npm install` downloads the packages the site needs (a minute or two). You only need it the first time, and again if someone adds a package.
- `npm run dev` starts the site. Open **http://localhost:3000** in your browser.
- Keep that terminal open while you work. Press `Ctrl + C` in it to stop the site.
- Changes you save appear in the browser straight away.

## Recommended VS Code extensions

Press `Ctrl + Shift + X` and install:

- **Tailwind CSS IntelliSense** (Tailwind Labs)
- **ESLint** (Microsoft)
- **Prettier – Code formatter** (Prettier)
- **Claude Code** (Anthropic), optional; see guide 5

Next: [Everyday workflow](02-daily-workflow.md)
