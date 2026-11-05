# 4. Publishing the live site

The live site is **https://hexarch-delta.vercel.app**. It's hosted on Vercel, on Fairooz's account.

## If GitHub is connected to Vercel (automatic)

Once Fairooz connects the GitHub repo in Vercel, publishing is automatic:

1. Commit and sync your changes (see guide 2).
2. Wait about a minute.
3. Refresh the live site. Your changes are there.

**Check before you sync:** run `npm run build` in the terminal first. If it fails on your computer, it will fail on Vercel too, and the live site keeps showing the old version until it's fixed.

## If GitHub isn't connected yet (manual)

Only someone logged in to the Vercel account can publish. In the `hexarch-website` folder, run:

```
npx vercel --prod
```

When it prints **Ready** and a **Production** link, the live site has updated.

## Connecting GitHub to Vercel (Fairooz, once)

1. On https://vercel.com, open the **hexarch** project.
2. Go to **Settings → Git → Connect Git Repository** and pick **teamHexarch/Momento**.
3. Go to **Settings → Build and Deployment** and set **Root Directory** to `hexarch-website`.
4. Save. From then on, every sync to `main` publishes automatically.

## Before sharing the link widely

- Replace the placeholder contact email in `content/site.ts` (`company.email`). The contact form sends to it.
- Check the `TODO` items in `content/site.ts`.

Next: [Using Claude Code](05-using-claude-code.md)
