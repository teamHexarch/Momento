# Hexarch website

The company website for Hexarch, the team behind Momento. Built with Next.js 16, Tailwind CSS 4 and Motion.

## See it on your computer

1. Install Node.js (the LTS version) from https://nodejs.org.
2. Unzip this folder and open a terminal inside it.
   - On Windows, if `npm` says "running scripts is disabled", run this once:
     `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`
3. Install the packages (needs internet, takes a minute or two):
   ```
   npm install
   ```
4. Start the site:
   ```
   npm run dev
   ```
5. Open http://localhost:3000 in your browser. Keep the terminal open while you look around; press `Ctrl + C` to stop it.

## Where things are

- `content/site.ts`: every word on the site (team, products, FAQ, emails). Edit this to change text.
- `app/`: the pages (home, products, Momento, about, investors, contact).
- `components/`: the sections, graphics and animations.
- `CLAUDE.md` and `docs/hexarch-brief.md`: the design rules and the project brief.
- Team photos go in `public/team/`; then set `photo: "/team/name.jpg"` for that person in `content/site.ts`.
