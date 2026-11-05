# Hexarch website handoff brief

Nov 3, 2026 · Fairooz

Everything needed to build the Hexarch company website in a new project: the business context, the current Momento site, the dev setup, the template, and the build plan. The directive in `CLAUDE.md` (repeated under Design direction below) overrides anything else in this file.

## At a glance

Hexarch is the parent company; Momento is its first product. The Momento site is built and live at [hexarch.org](https://hexarch.org/index.html). The next job is a separate Hexarch company site in Next.js.

| | |
| --- | --- |
| **Founder** | Fairooz, Diploma of IT student at Monash College, Melbourne |
| **Company** | Hexarch (the Momento footer currently says "HexArch Limited"; confirm the legal name) |
| **First product** | Momento: a shared event photo album guests join by QR code or six-letter code, no sign-up |
| **Hexarch site's jobs** | Show off the products, work as a portfolio for investors and users, introduce the team |
| **Starting point** | The [Agenciy Framer template](https://agenciy.framer.website/), used for its style and section order |
| **Project folder** | `C:\Users\iball\hexarch`, running at `localhost:3000` |
| **Status** | Next.js starter page running; no Hexarch content built yet |

## Momento site review

The Momento site is polished and specific, and it should stay a separate site with its own look. The Hexarch site should present Momento as a product, not repeat it. Reviewed in the browser on 3 November 2026 at 1280 × 800.

**What it says, section by section**

1. **Hero:** "Moments, kept." / "Every photo from your event, in one shared album." Buttons: Create an album, Join with a code. A live QR card ("Amira & Joel's wedding") with floating photo prints.
2. **How it works:** five steps: Create the event, Put the code out, Guests scan and join, Everyone shares, It all lands in one album. A phone mock-up shows a "Rooftop Birthday" album.
3. **Features:** "Only the people who were there" (sharing zones with a live radius slider), plus Cameras and phones together, Uploads that behave, Your cloud your copy, Sorted for you.
4. **For hosts:** "Set it up once, enjoy the night": gallery visibility, video and originals toggles, and a live dashboard.
5. **Pricing:** "Free to start": Free at $0 (zones up to 1 km, full quality, saves to Google Drive, iCloud, Dropbox or OneDrive), Momento Plus "Coming soon" with a waitlist.
6. **FAQ:** accounts, photo ownership, sharing zones, real cameras, mobile data.
7. **Footer:** product links, help links, a light/dark/system switch, "© 2026 HexArch Limited. Proof of concept."

**Its look**

- Dark, glassy, purple-dusk theme over an animated fluid background drawn on a canvas.
- Type: the device's system font (SF Pro on Apple devices), with Inter as the fallback, at weights 400 to 700.
- Colour tokens: dusk `#2E2C3A`, lavender `#D9D0EA`, blush `#E6CDD6`, copper `#9A603D`, tide `#6F9896`, fog `#ECEAF0`, paper `#F8F7FA`, slate `#5C596B`.
- Interactive demos (QR card, zone map, live dashboard) do the selling instead of stock images.

**Fix on the Momento site**

| Issue | Why it matters | Fix |
| --- | --- | --- |
| Momento sits at the root of hexarch.org | The company domain shows a product, so there's no home for the Hexarch site | Move Momento to `momento.hexarch.org` or its own domain; put the Hexarch site at `hexarch.org` |
| All 66 images have no alt text | Screen readers announce nothing, and search engines can't read them | Add short alt text; mark purely decorative images `alt=""` |
| Five empty `<h2>` headings in the hero slides | Breaks the heading outline for screen readers and SEO | Give each a real heading or use a non-heading element |
| "HexArch" in the footer vs "Hexarch" elsewhere | Inconsistent brand name | Pick one spelling and use it everywhere |
| "Limited" in the footer | Australian private companies usually end in "Pty Ltd" | Use the exact registered name, or just "Hexarch" until registered |
| A preview sign-up form with Apple and Google buttons | Looks real but creates no account | Label it clearly as a preview, or hide it until accounts exist |
| Pricing differs from the business analysis | The site shows Free + Plus; the analysis proposed A$9, A$29, A$79 and A$290 tiers | Decide the model, then update one or the other |

**Carry over to the Hexarch site**

- Copper `#9A603D` as a shared family thread, so Hexarch and Momento read as related.
- The habit of showing the product working (a demo, a screen) instead of describing it.
- The plain, confident tone: short sentences, sentence case, no hype.

## Momento business findings

The verdict was go, as a lean self-funded project with a 90-day test, starting with university clubs. The full research is in the [MOMENTO Competitor Analysis](https://claude.ai/artifact/TU8wwm3g1UJ2arJdkpzbjf). All revenue figures for private companies are estimates.

| Competitor | Position | Takeaway for Momento |
| --- | --- | --- |
| [POV](https://pov.camera) | Bootstrapped leader; est. US$1.2M–3.6M a year; prices per guest | The real threat; beat it on flat pricing and camera-roll uploads |
| [Dots Memories](https://dotsmemories.app) | Valencia, Spain; est. under US$0.25M a year; complaints about lost photos | Easy to disrupt with reliable uploads and a fixed QR code |
| [Kululu](https://kululu.com) | Bootstrapped since 2019; web-only; from ~US$39 an event | Beatable on price for small events and clubs |
| Lapse | Raised ~US$42M, then removed its social features in late 2025 over cost | Money doesn't fix weak economics; charge from day one |

- **Market:** about US$20M–60M a year worldwide for paid guest photo apps (estimate) and about A$3.5M a year in Australia (estimate).
- **Base-case projection:** about A$13K in Year 1 and A$204K by Year 3 (analyst estimate).
- **Proposed pricing:** Free, Party A$9, Celebration A$29, Club Pass A$79 a year, Business A$290 a year. This isn't on the live site yet.
- **Biggest risk:** guests not bothering to upload. The 90-day plan tests whether at least 30% of attendees upload and at least 3 of 10 pilot clubs pay.

For the investor section of the Hexarch site, use only real facts (launch dates, pilots run, real user counts). Label any market estimate as an estimate, with its source.

## Development setup

Everything needed to build is installed on the Windows laptop, and the starter site runs at `localhost:3000`.

| Tool | State | Notes |
| --- | --- | --- |
| Node.js | v26.13.0 | Next.js needs 20.9 or later |
| npm | 12.2.1 | PowerShell needed `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use `npm.cmd` |
| Next.js project | 16.4.4, Turbopack, at `C:\Users\iball\hexarch` | TypeScript, Tailwind CSS, ESLint, App Router; Cache Components and Partial Prefetching on |
| Motion | Installed | Import from `motion/react`; files that use it start with `"use client"` |
| Git for Windows | Installed | Default editor VS Code; default branch `main` |
| Claude Code | 2.1.317, native install | Added `C:\Users\iball\.local\bin` to the user PATH |
| VS Code | Claude Code extension (Anthropic) installed; folder trusted | Also installed: Live Server and Python extensions, not needed here |
| To add | Tailwind CSS IntelliSense, ESLint, Prettier; frontend-design plugin via `/plugin` | Turn on format on save with Prettier |

**Gotchas met so far**

- A dropped connection left `node_modules` half-installed; re-running `npm install` in the folder fixed it.
- `npm run dev.` with a full stop fails; type commands exactly.
- The dev server stops if its terminal closes; run installs in a second terminal tab.
- `npm audit` reports 16 moderate warnings in dev tools; leave them, and never run `npm audit fix --force`.

## Template analysis

Agenciy is a Framer template for creative agencies. Its style and section order are the base for Hexarch, but about half its sections assume an agency selling services, so their content is replaced with Hexarch's own. Reviewed in the browser on 3 November 2026.

**Pages:** Home, About, Projects (with case-study pages), Blog, Contact. Navigation: Services, About, Projects, Blog, Contact, and a "Let's Chat!" button.

**Home page, in order:** hero, client logo ticker, "We do" list, featured project, four service cards, About with stats, three project cards, a four-step process, awards, a team carousel, three pricing plans, client testimonials, FAQ, contact form, footer.

**Look:** black background with white text; large headlines (about 100px); rounded cards (20–56px corners); pill-shaped buttons; numbering on services and process.

**What carries over and what doesn't:** keep the general style (dark theme, large headlines, rounded cards) and the exact section order. Leave out everything the seller made: the 3D renders, images, illustrations, logo and wording. The Hexarch build uses its own words and graphics only.

## Hexarch site plan

Five pages: Home, Products (with a page per product), About, Investors and Contact. The home page follows the template's section order exactly, with Hexarch content in each slot.

| Template section | Hexarch version | Content source |
| --- | --- | --- |
| Hero | One-line statement of what Hexarch builds, with an original Hexarch graphic | Fairooz to confirm the statement |
| Client logo ticker | Logo strip slot; hidden until there are real partners or press | Real logos only, with permission |
| "We do" list | What Hexarch builds: consumer apps for real-world moments (confirm) | Fairooz |
| Featured project | Featured product: Momento, with a screen and a link to its site | Momento site |
| Service cards | Four cards: Momento plus Hexarch's focus areas; a "next product" card only if one is really in progress | Real products only |
| About + stats | Story and mission; facts only (founded year, Melbourne, products launched) | Fairooz |
| Project cards | Products; `/products/momento` as a case study (problem, what we built, how it works, status) | Momento site + analysis |
| Process | How we build: Research, Design, Build, Test with real users | Fairooz to confirm |
| Awards | Milestones, real dates only (e.g. Momento proof of concept, 2026) | Fairooz |
| Team carousel | Team with real names, roles and photos | Fairooz to supply |
| Pricing | Slot kept, hidden on Hexarch; pricing lives on each product's own site | — |
| Testimonials | Slot kept, hidden until there are real quotes, used with permission | Pilot users later |
| FAQ | Questions from users and investors: who's behind it, where's my data, stage, how to get involved | Fairooz + Momento FAQ |
| Contact form | Two paths: product support (to Momento support) and investors or partners (to an email) | Emails to confirm |
| Footer | Melbourne, email, socials, © Hexarch with the legal name | Fairooz |

**Pages**

- **Home** (`/`): the 15 sections above, in order.
- **Products** (`/products`, `/products/momento`): one card per product; each product page links out to the product's own site.
- **About** (`/about`): story, mission, values, team.
- **Investors** (`/investors`): stage, the problem and market (estimates labelled), traction (real numbers only), what Hexarch is looking for, and a "Request the deck" contact button.
- **Contact** (`/contact`): the two-path form, plus email links.
- **Later:** a News page in place of the template's Blog, once there's news to post.

## Design direction

Fairooz's directive sets the base look: a dark theme, large headlines, rounded cards, and the template's exact section order. Everything inside that frame is Hexarch's own: its words, and graphics from the project folder or made new for Hexarch. The look is a base to customise together as the site develops.

**Directive**

1. **Style:** dark theme, large headlines, rounded cards, and the template's section order exactly.
2. **Content:** only Hexarch's own words, from this brief and Fairooz's edits, and original graphics from the project folder.
3. **Hard stop:** no text, images, 3D renders or copy from the template seller's assets, used or referenced.

**Colours**

| Name | Value | Use |
| --- | --- | --- |
| Black | `#000000` | Page background |
| Card | `#1B1B1B` | Cards and panels |
| Card raised | `#242424` | Hover and active cards |
| Line | `rgba(255,255,255,0.10)` | Borders and dividers |
| Text | `#FFFFFF` | Headlines and body |
| Muted | `#A3A3A3` | Secondary text |
| Copper | `#9A603D` | The one accent: links, focus rings; shared with Momento |

**Type**

- **Inter** via `next/font`: headlines in 600 with tight letter-spacing, body in 400.
- Large headlines: hero 96–112 px on desktop (about 48 px on mobile), section headings 56–64 px, card titles 24–28 px.
- Body 16–18 px, 1.55 line height, lines under 75 characters.

**Shape**

- Cards: 24 px corners. Large panels: 48 px corners. Buttons and tags: fully rounded pills.
- Thin 1 px borders in Line; no drop shadows.

**Section order (home page)**

The template's order is kept exactly; the content in each slot follows the Hexarch site plan table above. A slot with no real Hexarch content yet (logos, awards, testimonials, pricing) stays in the code but is hidden until its content exists in `content/site.ts`.

1. Hero
2. Logo strip
3. "What we do" list
4. Featured product
5. Four cards (products and focus areas)
6. About with facts
7. Product cards
8. Process (four steps)
9. Recognition (milestones)
10. Team
11. Plans (hidden on Hexarch)
12. Testimonials (hidden until real)
13. FAQ
14. Contact form
15. Footer

**Graphics**

Only Hexarch's own: files in `public/` (such as the Momento icon and screenshots) or new SVG and CSS shapes drawn for Hexarch. Nothing downloaded from or traced off the template.

## Rules for building

**Content honesty** (the site is aimed at investors, so this matters most)

- No invented client logos, testimonials, awards, team members or stats.
- Until real content exists, keep the section hidden. Don't fill it with realistic-looking placeholders.
- Market figures carry the word "estimate" and a source.
- Momento is called a proof of concept until it has real users.

**Template**

- **Style:** dark theme, large headlines, rounded cards, and the template's section order exactly.
- **Content:** only Hexarch's own words, from this brief and Fairooz's edits, and original graphics from the project folder.
- **Hard stop:** no text, images, 3D renders or copy from the template seller's assets, used or referenced.

**Next.js 16 specifics**

- App Router: pages are `app/<route>/page.tsx`; shared parts go in `components/`.
- Read `AGENTS.md` (if present) and the docs bundled in `node_modules/next/dist/docs/` before writing code. Next.js 16 changed things since most tutorials were written.
- Cache Components is on: keep pages static, and wrap anything that reads request data in `<Suspense>`.
- Tailwind CSS v4: put colour and font tokens in `@theme` inside `app/globals.css`; there's no `tailwind.config.js`.
- Fonts through `next/font/google`, images through `next/image`, and page titles and descriptions through the `metadata` export.
- Motion only in client components (`"use client"`), and respect `prefers-reduced-motion`.
- Keep editable content (team, products, milestones, emails) in one file, `content/site.ts`, so updates don't mean editing layouts.

**Deploying**

- Push to GitHub, then import the repo into Vercel. Each push to `main` goes live.
- Point `hexarch.org` at Vercel once Momento has moved to its own address.

## Open questions

- [ ] What is Hexarch's one-line mission, and what kinds of products will it build?
- [ ] Is the legal name Hexarch, HexArch Limited or something else, and is there an ABN to show?
- [ ] Who is on the team (names, roles, photos, LinkedIn)? *Partly answered 3 Nov 2026: Fairooz, Shreyash, Yusuf, Chelsea and Hamza, Monash University students from Bangladesh, Egypt, Hong Kong, India, Indonesia and Pakistan. Still needed: roles (other than Fairooz, founder), photos, LinkedIn.*
- [ ] Are there other products in progress that can be named publicly?
- [ ] Which email addresses should support and investor enquiries go to?
- [ ] What stage is Hexarch at for investors (bootstrapped, raising, or just building relationships)?
- [ ] Is there a Hexarch logo, or should one be designed?
- [ ] Where will Momento live once hexarch.org becomes the company site?
- [ ] Which social accounts should the footer link to?
- [ ] Which pricing model is final for Momento: the live Free + Plus, or the proposed tiers?

## Build status

As of 3 November 2026, nothing Hexarch-specific is built. The folder still has the create-next-app starter page, layout (Geist font, "Create Next App" title) and styles, and `public/` holds only the starter SVGs. `CLAUDE.md` lists the config facts to preserve (Tailwind through the `@tailwindcss/turbopack` loader, `cacheComponents` and `partialPrefetching` on, React 19.3.0, Motion ^14.9.0) and the files to create, in order.

## Prompt for Claude Code

Paste this into the Claude Code panel in the new project or session:

```markdown
You're building the company website for Hexarch, the parent company of Momento (an event photo-sharing app). Read CLAUDE.md, docs/hexarch-brief.md, AGENTS.md if present, and the Next.js docs in node_modules/next/dist/docs/ before writing any code. CLAUDE.md's directive overrides anything else.

Goals: show off Hexarch's products, work as a portfolio for investors and users, and introduce the team.

Build in this order, and stop for my review after each step:
1. Design tokens in app/globals.css (Tailwind v4 @theme) and the Inter font in app/layout.tsx, from the Design direction section.
2. content/site.ts holding all editable content (products, team, milestones, emails). Use clearly marked TODO values where the brief's open questions aren't answered. Never invent people, clients, quotes, awards or numbers.
3. Shared header, footer and layout.
4. Home page with the template's 15 sections in its exact order, filled from the Hexarch site plan table. Hide any section whose content is still empty.
5. /products and /products/momento.
6. /about, /investors and /contact.

Rules: dark theme, large headlines, rounded cards; no text, images, 3D renders or copy from the template seller; responsive down to 360px with visible keyboard focus; run npm run lint and npm run build before saying a step is done.

CLAUDE.md's "Build status" section says what exists already and which config to keep. Start by giving me a short plan for step 1, then wait for my OK.
```

## Sources

- [Momento site, hexarch.org](https://hexarch.org/index.html), reviewed in the browser on 3 November 2026
- [Agenciy Framer template](https://agenciy.framer.website/), reviewed in the browser on 3 November 2026
- [MOMENTO Competitor Analysis](https://claude.ai/artifact/TU8wwm3g1UJ2arJdkpzbjf)
- [Next.js installation docs](https://nextjs.org/docs/app/getting-started/installation)
- [Motion for React installation](https://motion.dev/docs/react-installation)
- [Claude Code setup](https://code.claude.com/docs/en/setup)
