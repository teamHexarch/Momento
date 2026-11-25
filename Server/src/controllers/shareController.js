import sharp from 'sharp';
import { config } from '../config/env.js';
import { Album } from '../models/Album.js';
import { Photo } from '../models/Photo.js';
import { Membership } from '../models/Membership.js';
import { Group } from '../models/Group.js';
import { GroupMember } from '../models/GroupMember.js';
import { normaliseCode } from '../utils/albumCodes.js';
import { openPhoto, saveFile } from '../services/storageService.js';

// ---- Share links: GET /s/:code ----
// Chat apps (WhatsApp, iMessage, Slack...) don't run the site's JavaScript, so a link to the static site can
// only ever show one generic card. This tiny page gives each invite link its own card: the album or group
// name, how many people are in it, and the album's cover. Then it sends the person on to the real page.
//
// What it may show is what the code already unlocks on the site (GET /api/albums/preview/:code):
// - an invite or public album: its name and people count, and the host's chosen cover (made to be public).
//   Only a public album (listed on the Events map) may fall back to its most-loved photo; an invite
//   album's photos never appear here, so a forwarded link can't show a guest's photo to strangers.
// - a friend group's album: nothing (its photos are only for the group), so the generic card.
// - a group link: the group's name and member count, with the generic picture.
// - a wrong, expired or revoked code: the generic card. Every case still redirects.

const GENERIC = {
  title: 'Join the album on Momento',
  description: 'Every photo from your event, in one shared album. Open the link to see it and add yours.',
  image: `${config.frontendUrl}/assets/og-momento.jpg`,
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const people = (n) => (n === 1 ? '1 person is' : `${n} people are`);

function page({ title, description, image, url, target }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">
<meta property="og:site_name" content="Momento">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<link rel="canonical" href="${esc(target)}">
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#ECECF3;color:#2E2C3A}a{color:#6C5FC7;font-weight:600}</style>
</head><body><p>Opening Momento… <a href="${esc(target)}">Continue</a></p></body></html>`;
}

// ---- The card picture: 1200×630 JPEG under 300 KB (WhatsApp ignores bigger ones) ----
// Made once per album and cover (the file name carries the cover's token or the photo id), then kept in
// storage, so a new cover gets a new picture and the old address keeps working for caches that have it.
const readAll = async (key) => { const chunks = []; for await (const c of await openPhoto(key)) chunks.push(c); return Buffer.concat(chunks); };
const made = new Map();     // file → JPEG bytes (the 50 most recent, so a link shared widely isn't re-read each time)
const making = new Map();   // file → the job making it (so many crawlers arriving at once make it once)
async function cardImage(album) {
  let source = null;
  if (album.cover?.key) source = { tag: `c-${album.cover.token}`, key: album.cover.key };
  else if (album.visibility === 'public') {
    const [top] = await Photo.aggregate([
      { $match: { album: album._id, deletedAt: null, flaggedAt: { $exists: false }, previewKey: { $exists: true } } },
      { $addFields: { score: { $add: [{ $size: { $ifNull: ['$reactions', []] } }, { $ifNull: ['$likeCount', 0] }] } } },
      { $sort: { score: -1, createdAt: -1 } }, { $limit: 1 }, { $project: { previewKey: 1 } },
    ]);
    if (top) source = { tag: `p-${top._id}`, key: top.previewKey };
  }
  if (!source) return null;
  const file = `og/${album.id}/${source.tag}.jpg`;
  if (made.has(file)) return { tag: source.tag, jpg: made.get(file) };
  if (!making.has(file)) {
    making.set(file, (async () => {
      let jpg = await readAll(file).catch(() => null);   // made before (kept in storage)
      if (!jpg) {
        const base = sharp(await readAll(source.key), { limitInputPixels: 100_000_000 }).autoOrient().resize(1200, 630, { fit: 'cover', position: 'attention' });
        for (const quality of [80, 70, 60, 50]) {
          jpg = await base.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
          if (jpg.length < 300 * 1024) break;
        }
        await saveFile(file, jpg, 'image/jpeg');
      }
      made.set(file, jpg);
      if (made.size > 50) made.delete(made.keys().next().value);
      return jpg;
    })().finally(() => making.delete(file)));
  }
  return { tag: source.tag, jpg: await making.get(file) };
}

// GET /s/:code  The card page (albums and groups)
export async function sharePage(req, res) {
  const raw = String(req.params.code || '');
  const code = normaliseCode(raw);
  const groupCode = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
  const self = `${config.publicUrl}/s/${encodeURIComponent(raw)}`;
  let card = { ...GENERIC }, target = `${config.frontendUrl}/events`;
  try {
    if (code.length === 7) {
      target = `${config.frontendUrl}/events?join=${encodeURIComponent(code)}`;
      const album = await Album.findOne({ code });
      if (album && !album.group) {
        const guests = await Membership.countDocuments({ album: album._id, via: { $ne: 'group' } });
        const image = await cardImage(album).catch((err) => { console.error(`Share card picture for ${album.id}: ${err.message}`); return null; });
        card = {
          title: `Join ${album.name} on Momento`,
          description: guests > 1 ? `${people(guests)} sharing photos. Open the link to see the album and add yours.` : 'Open the link to see the album and add your photos.',
          image: image ? `${config.publicUrl}/s/${encodeURIComponent(code)}/${image.tag}.jpg` : GENERIC.image,
        };
      }
    } else if (groupCode.length >= 8) {
      target = `${config.frontendUrl}/events?group=${encodeURIComponent(groupCode)}`;
      const group = await Group.findOne({ inviteCode: groupCode }, 'name');
      if (group) {
        const members = await GroupMember.countDocuments({ group: group._id });
        card = {
          title: `Join ${group.name} on Momento`,
          description: members > 1 ? `${people(members)} sharing albums in this group. Open the link to join.` : 'Open the link to join the group and share albums together.',
          image: GENERIC.image,
        };
      }
    }
  } catch (err) {
    console.error(`Share page: ${err.message}`);   // still a generic card and the redirect
  }
  res.set({
    'Cache-Control': 'public, max-age=600',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
    'X-Frame-Options': 'DENY',
  });
  res.type('html').send(page({ ...card, url: self, target }));
}

// GET /s/:code/:tag.jpg  The card picture (only for an album whose card shows it right now)
export async function shareImage(req, res) {
  const code = normaliseCode(req.params.code);
  const tag = String(req.params.tag || '');
  const album = code.length === 7 && /^(c|p)-[\w-]{1,64}$/.test(tag) ? await Album.findOne({ code }) : null;
  const image = album && !album.group ? await cardImage(album).catch(() => null) : null;
  if (!image || image.tag !== tag) return res.redirect(302, GENERIC.image);
  // The address changes whenever the cover does (its tag), so the picture can be cached for good
  res.set({ 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff' });
  res.send(image.jpg);
}
