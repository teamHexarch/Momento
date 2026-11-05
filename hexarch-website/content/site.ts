/**
 * All editable Hexarch content lives here.
 *
 * Rules (from CLAUDE.md):
 * - Only Hexarch's own words. Never invent people, clients, quotes, awards or numbers.
 * - Anything not yet confirmed is marked TODO.
 * - A section whose list is empty is hidden on the page, but keeps its slot in the template order.
 */

export type NavLink = { label: string; href: string };

export const site = {
  company: {
    name: "Hexarch",
    // TODO: confirm the registered legal name (the Momento footer says "HexArch Limited").
    legalName: "Hexarch",
    tagline: "Products for real moments",
    description:
      "Hexarch is a Melbourne product company. We build simple software for the moments people share in real life, starting with Momento.",
    location: "Melbourne, Australia",
    // TODO: confirm the address that support and investor emails should go to.
    email: "hello@hexarch.org",
    year: 2026,
  },

  nav: [
    { label: "Products", href: "/products" },
    { label: "About", href: "/about" },
    { label: "Process", href: "/#process" },
    { label: "Investors", href: "/investors" },
    { label: "Contact", href: "/contact" },
  ] satisfies NavLink[],

  // TODO: add real profile links. The socials column and hero icons stay hidden while this is empty.
  socials: [] as NavLink[],

  hero: {
    lineOne: "Built for",
    lineTwo: "real moments",
    intro:
      "We build products for the moments people share in real life, starting with Momento, a shared photo album for events.",
    cta: { label: "Get in touch", href: "/contact" },
    weDo: ["Consumer apps", "Product design", "Engineering", "Research"],
  },

  // Slot 2 (logo strip). There are no partner logos yet, so the strip scrolls Hexarch's own focus words.
  // TODO: add real partner or press logos here once there are any, used with permission.
  logos: [] as { name: string; src: string }[],
  marqueeWords: [
    "Momento",
    "Shared event albums",
    "Made in Melbourne",
    "Product design",
    "Web apps",
    "Research first",
    "Tested with real people",
  ],

  build: {
    tag: "What we build",
    titleSerif: "What",
    title: "We Build",
    intro:
      "Hexarch designs, builds and tests its own products. Every idea starts with a real problem people run into at events and gatherings.",
    cards: [
      {
        icon: "album",
        title: "Momento",
        text: "A shared photo album for events. Guests scan one code and add their photos, with no sign-up.",
        href: "/products/momento",
      },
      {
        icon: "design",
        title: "Product Design",
        text: "Interfaces shaped around how people behave on the night, then tested before they ship.",
      },
      {
        icon: "code",
        title: "Engineering",
        text: "Fast, dependable web apps built on foundations we can keep growing.",
      },
      {
        icon: "research",
        title: "Research",
        text: "User and market research before we build, so each product answers a need people already have.",
      },
    ],
  },

  about: {
    tag: "About us",
    wordmark: "hexarch",
    text: "Hexarch is a product company based in Melbourne. We build simple, honest software for the moments people share, and we test it with real people before it grows.",
    // Real facts only.
    stats: [
      { value: "01", label: "Product built" },
      { value: "04", label: "Cloud services Momento saves to" },
      { value: "06", label: "Letters in a Momento join code" },
    ],
  },

  products: [
    {
      slug: "momento",
      name: "Momento",
      summary: "Every photo from your event, in one shared album",
      tags: ["Event photo sharing", "Web app"],
      badges: [
        { mark: "PoC", title: "Proof of concept", detail: "2026" },
        { mark: "Live", title: "Live at hexarch.org", detail: "2026" },
      ],
      url: "https://hexarch.org/index.html",
    },
  ],

  process: {
    tag: "Our process",
    titleSerif: "How we",
    title: "build products",
    intro:
      "Small steps, tested early. Each product goes from a real problem to something people can use, without guessing along the way.",
    steps: [
      {
        title: "Research",
        text: "Talk to the people who have the problem, and size the market before writing code.",
      },
      {
        title: "Design",
        text: "Sketch the simplest flow that works, then shape it until it feels obvious.",
      },
      {
        title: "Build",
        text: "Ship a working version quickly, on solid foundations we can grow.",
      },
      {
        title: "Test with real users",
        text: "Run real events and pilots, measure what happens, and improve.",
      },
    ],
  },

  // Slot 9 (awards). Hexarch has no awards yet, so this shows real milestones.
  milestones: {
    tag: "Milestones",
    items: [
      { category: "Momento", title: "Proof of concept built", detail: "2026" },
      { category: "Momento", title: "Site live at hexarch.org", detail: "2026" },
      { category: "Research", title: "Event photo market analysis", detail: "Nov 2026" },
    ],
  },

  team: {
    tag: "Team",
    titleLead: "Meet the",
    titleSerif: "Team",
    // Countries are listed in the order Fairooz gave them. TODO: confirm each person's country.
    // TODO: add roles, and photos (put files in public/team/ and set photo: "/team/name.jpg").
    members: [
      { name: "Fairooz", role: "", country: "Bangladesh", photo: null },
      { name: "Shreyash", role: "", country: "India", photo: null },
      { name: "Imaad", role: "", country: "Pakistan", photo: null },
      { name: "Yusuf", role: "", country: "Indonesia", photo: null },
      { name: "Chelsea", role: "", country: "Hong Kong", photo: null },
      { name: "Hamza", role: "", country: "Egypt", photo: null },
    ] as { name: string; role: string; country: string; photo: string | null }[],
  },

  // Slot 11 (pricing). Hidden on Hexarch: pricing lives on each product's own site.
  plans: [] as { name: string; price: string; features: string[] }[],

  // Slot 12 (testimonials). Hidden until there are real quotes, used with permission.
  testimonials: [] as { quote: string; name: string; role: string }[],

  faq: {
    tag: "FAQs",
    items: [
      {
        q: "What is Hexarch?",
        a: "Hexarch is a product company in Melbourne. It builds and runs its own apps, starting with Momento.",
      },
      {
        q: "What is Momento?",
        a: "A shared photo album for events. The host makes one code, guests scan it and add their photos, and everything lands in one album. Guests don't need an account.",
      },
      {
        q: "Is Momento free?",
        a: "Momento is free to start. A paid plan, Momento Plus, is on the way for bigger venues.",
      },
      {
        q: "Who owns the photos?",
        a: "The people who took them. Momento saves each album to the cloud the host chooses: Google Drive, iCloud, Dropbox or OneDrive.",
      },
      {
        q: "Can investors or partners get in touch?",
        a: "Yes. Use the contact form, choose Investors and partners, and we'll reply with more about where Hexarch is heading.",
      },
    ],
  },

  contact: {
    titleLead: "Let's Talk",
    titleSerif: "About What's Next",
    formTitle: "Send us a message",
    topics: ["Momento support", "Investors and partners", "Something else"],
  },

  investors: {
    // TODO: confirm Hexarch's stage (bootstrapped, raising, or building relationships).
    stage: "Hexarch is at an early stage. Momento is a working proof of concept, and the next step is pilots with real events.",
    marketNote:
      "Hexarch's own estimate puts paid guest photo apps at about US$20M to US$60M a year worldwide, and about A$3.5M a year in Australia (Hexarch analysis, November 2026).",
    traction:
      "Momento's proof of concept is built and live at hexarch.org. Real user numbers will appear here once pilots begin.",
  },
};

export type Site = typeof site;
