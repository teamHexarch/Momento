# 3. Editing the site

## Changing text: `content/site.ts`

Almost every word on the site lives in one file: **`content/site.ts`**. Edit the words between the quotes, save, and the site updates.

| What you want to change | Where in `content/site.ts` |
| --- | --- |
| Company name, email, location | `company` |
| Top menu links | `nav` |
| Big headline and intro at the top | `hero` |
| Words scrolling along the bottom of the hero | `marqueeWords` |
| The four cards ("What We Build") | `build` |
| About paragraph and the three big numbers | `about` |
| Product showcase (Momento) | `products` |
| The four process steps | `process` |
| Milestones list | `milestones` |
| Team members | `team.members` |
| Questions and answers | `faq.items` |
| Contact form wording | `contact` |
| Investors page text | `investors` |

Anything marked **`TODO`** still needs a real answer, such as the contact email and legal name.

> Keep the quotes and commas. If the site shows a red error after you edit, you probably deleted a `"` or a `,`. Press `Ctrl + Z` to undo and try again.

## Adding a team photo

1. Use a portrait photo, roughly 4:5 (for example 800 × 1000 px), JPG or WebP, under 300 KB.
2. Name it in lowercase with no spaces, for example `chelsea.jpg`.
3. Put it in **`public/team/`** (create the `team` folder if it isn't there).
4. In `content/site.ts`, find that person under `team.members` and change `photo: null` to:
   ```ts
   photo: "/team/chelsea.jpg"
   ```
5. Add their role at the same time: `role: "Designer"`.

## Adding a team member

Copy an existing line in `team.members`, paste it below, and change the details:

```ts
{ name: "New Person", role: "Their role", country: "Their country", photo: null },
```

The sentence under "Meet the Team" ("Six of us, from …") updates by itself.

## Where the sections live

| Section on the page | File |
| --- | --- |
| Top menu | `components/Header.tsx` |
| Footer | `components/Footer.tsx` |
| Hero (headline, moving columns, featured card, scrolling words) | `components/home/Hero.tsx` and `HeroBackground.tsx` |
| Moving hexagon columns | `components/graphics/HexColumns.tsx` |
| What We Build cards | `components/home/Build.tsx` |
| About | `components/home/About.tsx` |
| Product showcase | `components/home/Products.tsx` |
| Process | `components/home/Process.tsx` |
| Milestones | `components/home/Milestones.tsx` |
| Team | `components/home/Team.tsx` and `TeamCarousel.tsx` |
| FAQ | `components/home/Faq.tsx` and `FaqList.tsx` |
| Contact | `components/home/Contact.tsx` and `ContactForm.tsx` |
| Other pages | `app/products`, `app/about`, `app/investors`, `app/contact` |
| Colours and fonts | `app/globals.css` |
| Animations (reveals, zooms, blurs) | `components/motion/motion.tsx` |

## Design rules

The full rules are in **`CLAUDE.md`**. In short:

- **Look:** dark theme, large headlines, rounded cards, pill buttons. Keep the home page's section order.
- **Content:** only Hexarch's own words and graphics. Never invent people, clients, quotes, awards or numbers.
- **Template:** no text, images or 3D renders copied from the Agenciy template.
- **Quality:** check every change on a phone-width screen too (in Chrome: `F12`, then the phone icon).

Next: [Publishing the live site](04-publishing.md)
