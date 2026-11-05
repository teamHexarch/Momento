# Hexarch website: rules for Claude

Read this file before every task in this project. The directive below overrides any other instruction, brief or default in this project.

## Directive

Apply these without re-asking, and don't propose a different look unless Fairooz asks for one.

1. **Target style:** dark theme, large headlines, rounded cards, and the exact section order of the reference template (Agenciy, https://agenciy.framer.website/).
2. **Content source:** only Hexarch's own words, from `docs/hexarch-brief.md` and Fairooz's edits, and original graphics from this project folder (`public/`) or new SVG and CSS shapes made for Hexarch.
3. **Hard stop:** no text, images, 3D renders or copy from the template seller's assets. Don't use them, reference them, download them or trace them.

## The project

- **Hexarch** is the parent company. **Momento** is its first product: a shared event photo album guests join by QR code or six-letter code, no sign-up. Momento's own site is live at hexarch.org.
- **This site's jobs:** show off Hexarch's products, work as a portfolio for investors and users, and introduce the team.
- **Full brief:** `docs/hexarch-brief.md` (business findings, Momento site review, site plan, open questions).

## Home page: the template's section order, exactly

1. Hero
2. Logo strip
3. "What we do" list
4. Featured product (Momento)
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

Every slot stays in the code in this order. A slot with no real Hexarch content in `content/site.ts` is hidden, not filled with placeholders.

Other pages: `/products`, `/products/momento`, `/about`, `/investors`, `/contact`.

## Design tokens

| Token | Value | Use |
| --- | --- | --- |
| black | `#000000` | Page background |
| card | `#1B1B1B` | Cards and panels |
| card-raised | `#242424` | Hover and active cards |
| line | `rgba(255,255,255,0.10)` | Borders and dividers |
| text | `#FFFFFF` | Headlines and body |
| muted | `#A3A3A3` | Secondary text |
| copper | `#9A603D` | The one accent: links and focus rings; shared with Momento |

- **Type:** Inter via `next/font/google`. Headlines 600 with tight letter-spacing; hero 96–112px on desktop, about 48px on mobile; section headings 56–64px; body 16–18px at 1.55 line height.
- **Shape:** cards 24px corners, large panels 48px, buttons and tags fully rounded; 1px borders in `line`; no drop shadows.

## Content honesty

- Never invent people, clients, logos, quotes, testimonials, awards, stats or prices.
- Unanswered details go in `content/site.ts` as clearly marked `TODO` values.
- Market figures are labelled as estimates, with a source. Momento is called a proof of concept until it has real users.

## Tech

- Next.js 16.4.4 with the App Router and Turbopack; Cache Components and Partial Prefetching are on. Read `AGENTS.md` if present and `node_modules/next/dist/docs/` before writing Next.js code.
- Tailwind CSS v4: tokens go in `@theme` inside `app/globals.css`; there's no `tailwind.config.js`.
- Motion is installed: import from `motion/react`, only in `"use client"` files, and respect `prefers-reduced-motion`.
- All editable content lives in `content/site.ts`; shared parts go in `components/`.
- Windows machine: Node 26.13.0, npm 12.2.1. Never run `npm audit fix --force`.

## Build status (3 November 2026)

The first full version is built. `npm run lint` and `npm run build` pass, and all pages are static.

- **Pages:** `/`, `/products`, `/products/momento`, `/about`, `/investors`, `/contact`.
- **Home page:** all 15 slots in template order. Slots 1–4 are inside `components/home/Hero.tsx`; Plans and Testimonials (`components/home/HiddenSlots.tsx`) render nothing while their lists in `content/site.ts` are empty.
- **Motion engine:** `components/motion/motion.tsx` holds `Reveal` (spring rise, bounce 0.2, 1.5s, optional blur), `ScrollZoom` (0.5 → 1 → 0.5 with blur as it passes), `CoverZoom` (1.1 → 1), `ScrollGrow`, `WordReveal` (words brighten on scroll) and `Roll` (hover text roll). `MotionProvider` respects reduced motion.
- **Hero background:** `components/graphics/HexColumns.tsx` draws turning chrome hex columns on a canvas; `HeroBackground.tsx` adds the load-in blur and zoom, the scroll sink and the blurred lights.
- **Graphics:** all original, in `components/graphics/Graphics.tsx` (card icons, Momento phone screen, portrait placeholder, wave lines). `public/` still holds only the starter SVGs.
- **Still TODO in `content/site.ts`:** legal name, contact email (currently `hello@hexarch.org`), social links, team photos and members, investor stage. The contact form opens the visitor's email app until a form service is chosen.
- There's no `AGENTS.md` in the folder, so read `node_modules/next/dist/docs/` directly.

**Config facts, so nothing gets overwritten by mistake**

- Versions: `next` 16.4.4, `react` and `react-dom` 19.3.0, `motion` ^14.9.0, `tailwindcss` ^4, `eslint` ^9, `typescript` ^5.
- Tailwind runs through the `@tailwindcss/turbopack` loader set in `next.config.ts` (`turbopack.rules` for `*.css`). There's no PostCSS config; don't add one.
- `next.config.ts` has `cacheComponents: true` and `partialPrefetching: true`; keep both.
- The root layout is typed `({ children }: LayoutProps<"/">)`; keep that pattern.
- ESLint uses the flat config in `eslint.config.mjs` (`core-web-vitals` + `typescript`).
- The import alias `@/*` points to the project root.

**Files to create, in order**

1. `app/globals.css`: the design tokens above in `@theme`, base body styles, and visible `:focus-visible` rings in copper.
2. `app/layout.tsx`: swap Geist for Inter, and set the title "Hexarch" and a real description.
3. `content/site.ts`: company, products (Momento), focus areas, process steps, milestones, team, FAQ and contact emails. Use `TODO` values for open questions, and empty arrays for hidden slots (logos, awards, testimonials, plans).
4. `components/`: `Header` (logo, menu button, "Let's talk" pill), `MobileMenu` (client), `Footer`, `Section`, `Button`, `Card`.
5. `components/home/`: one file per home section, rendered in the 15-slot order; each returns `null` when its content is empty.
6. `app/page.tsx`: the home page assembling the sections.
7. `app/products/page.tsx`, `app/products/momento/page.tsx`, `app/about/page.tsx`, `app/investors/page.tsx`, `app/contact/page.tsx`.
8. The contact form: a `mailto:` link or form action to the confirmed email, until a form service is chosen.

Steps 1–8 above are done. Next work is filling the TODOs, adding real photos, and refining sections with Fairooz.

**Starting a new session:** say "Read CLAUDE.md, then help me refine the Hexarch site."

## How to work

- Build in small steps and stop for Fairooz's review after each one.
- Run `npm run lint` and `npm run build` before saying a step is done.
- Keep the site responsive down to 360px, with visible keyboard focus and good colour contrast.
- When Fairooz changes the design, update the tokens and this file, so the next session starts from the current decisions.

## Reusing these rules in another project

Copy `CLAUDE.md` and `docs/hexarch-brief.md` into the new project's folder, or upload both to a Claude project's files. Claude Code reads `CLAUDE.md` automatically in any folder it opens.
