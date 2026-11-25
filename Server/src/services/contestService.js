// Host-judged photo competitions ("Best dance move"): a game type ("contest") in services/gameService.js.
//  1. While it's open, guests upload photos for it (1-3 each; the host's choice). Each is checked like any upload
//     (no GPS; the nudity check refuses level 85+) and stored under temp-minigames/<event>/<round>/.
//  2. The host closes entries and asks for a shortlist: Rekognition (labels and faces) scores each entry against the
//     competition's name, and the best 5-7 become finalists, each with a one-line reason. Entries at level 75+ are
//     never shortlisted. Without Rekognition (no permission, an error) the sharpest photos are shortlisted instead.
//  3. The host picks 1st, 2nd and 3rd (any entries): 100, 60 and 30 points on the event's leaderboard.
//  4. When it ends, only the top 10 are kept (the podium, then the best-scored): copied to minigames-top10/<event>/
//     and shown to the event. Every other entry is deleted from storage and the database at once. A competition still
//     open 24 hours after it started is ended the same way by the hourly jobs (sweepContests).
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { buffer as streamToBuffer } from 'node:stream/consumers';
import { GameRound, GameAward, ContestEntry } from '../models/Game.js';
import { Album } from '../models/Album.js';
import { HttpError } from '../utils/httpError.js';
import { config } from '../config/env.js';
import { sanitizePhoto } from './imageService.js';
import { saveFile, removeFile, openPhoto } from './storageService.js';

export const KEEP_TOP = 10, MIN_FINALISTS = 5, MAX_FINALISTS = 7, CONTEST_HOURS = 24, BLOCK_LEVEL = 85, SHORTLIST_MAX_LEVEL = 75;

export function readContest(b) {
  const maxEntries = b.maxEntries === undefined ? 1 : Number(b.maxEntries);
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 3) throw new HttpError(400, 'Allow 1 to 3 photos per person.', 'GAME_INVALID');
  return { maxEntries, phase: 'entries', finalists: [], podium: [] };
}

const games = () => import('./gameService.js');
const links = (round, e) => {
  const base = `${config.publicUrl}/api/albums/${round.album}/games/${round._id}/submissions/${e._id}/image`;
  return { url: base, thumbnailUrl: `${base}?size=thumb` };
};

// ---- Entering ----
export async function submit(album, user, roundId, file) {
  const { liveRound, forgetGames } = await games();
  const round = await liveRound(album, roundId, 'contest');
  if (round.settings.phase !== 'entries') throw new HttpError(409, 'Entries for this competition have closed.', 'GAME_ENTRIES_CLOSED');
  if (!file?.buffer?.length) throw new HttpError(400, 'Choose a photo to enter.', 'GAME_INVALID');
  if (await ContestEntry.countDocuments({ round: round._id, user: user._id }) >= round.settings.maxEntries) {
    throw new HttpError(409, `You can enter up to ${round.settings.maxEntries} photo${round.settings.maxEntries === 1 ? '' : 's'}.`, 'GAME_ENTRY_LIMIT');
  }
  // Checked like any upload: a real picture, no GPS, upright; the nudity check on the result
  const clean = await sanitizePhoto(file.buffer, { name: file.originalname || '' });
  const nsfw = await import('./nsfwService.js');
  const scores = nsfw.checkIsOff() ? null : await nsfw.scan(clean.preview);
  const level = scores?.engine === 'rekognition' ? scores.level : (nsfw.isExplicit(scores) ? 100 : 0);
  if (level >= BLOCK_LEVEL || (!scores?.engine && nsfw.isExplicit(scores))) {
    throw new HttpError(422, 'This photo can’t be entered: it looks like it contains nudity, which isn’t allowed on Momento.', 'nsfw');
  }
  const id = crypto.randomUUID();
  const key = `temp-minigames/${album._id}/${round._id}/${id}.jpg`, thumbKey = `${key}.thumb.webp`;
  await Promise.all([saveFile(key, clean.preview, clean.previewMimeType), saveFile(thumbKey, clean.thumbnail, 'image/webp')]);
  try {
    const e = await ContestEntry.create({ round: round._id, album: album._id, user: user._id, key, thumbKey, mime: clean.previewMimeType, level });
    forgetGames(album._id);
    return { id: String(e._id), ...links(round, e) };
  } catch (error) {
    await Promise.allSettled([removeFile(key), removeFile(thumbKey)]);
    throw error;
  }
}
export async function withdraw(album, user, roundId, entryId) {
  const { liveRound, forgetGames } = await games();
  const round = await liveRound(album, roundId, 'contest');
  if (round.settings.phase !== 'entries') throw new HttpError(409, 'Entries for this competition have closed.', 'GAME_ENTRIES_CLOSED');
  if (!mongoose.isValidObjectId(entryId)) throw new HttpError(404, 'Entry not found.', 'GAME_NOT_FOUND');
  const e = await ContestEntry.findOneAndDelete({ _id: entryId, round: round._id, user: user._id });
  if (!e) throw new HttpError(404, 'Entry not found.', 'GAME_NOT_FOUND');
  await dropFiles([e]);
  forgetGames(album._id);
  return { ok: true };
}
async function dropFiles(entries) {
  await Promise.allSettled(entries.flatMap((e) => [e.key && removeFile(e.key), e.thumbKey && removeFile(e.thumbKey)].filter(Boolean)));
}

// ---- The shortlist ----
const words = (text) => [...new Set(String(text).toLowerCase().match(/[a-z]{3,}/g) || [])]
  .filter((w) => !['the', 'and', 'best', 'most', 'with', 'for', 'photo', 'picture', 'shot'].includes(w));
// Word endings ignored when matching (dance / dancing / dances, toast / toasting, smile / smiling)
const stem = (w) => w.replace(/(ing|ers|er|es|e|s)$/, '');
// A score and a one-line reason for one entry, from Rekognition's description, against the competition's name
export function scoreEntry(title, d) {
  const wanted = words(title).map(stem);
  let score = 0; const why = [];
  const match = (d.labels || []).map((l) => ({ l, hit: [l.name, ...(l.parents || [])].some((n) => wanted.some((w) => w && stem(String(n).toLowerCase()).includes(w))) }))
    .filter((x) => x.hit).sort((a, b) => b.l.confidence - a.l.confidence)[0];
  if (match) { score += 3 * (match.l.confidence / 100); why.push(`matches “${match.l.name.toLowerCase()}” (${Math.round(match.l.confidence)}%)`); }
  const faces = d.faces || [];
  const smiles = faces.filter((f) => f.smile).length, open = faces.filter((f) => f.eyesOpen).length;
  if (smiles) { score += Math.min(3, smiles) * 0.5; why.push(`${smiles} smiling face${smiles === 1 ? '' : 's'}`); }
  if (faces.length) score += (open / faces.length) * 0.5;
  const sharp = faces.map((f) => f.sharpness).filter(Number.isFinite);
  if (sharp.length) { const s = sharp.reduce((a, b) => a + b, 0) / sharp.length; score += s / 100; if (s >= 60) why.push('sharp'); }
  return { score: Math.round(score * 100) / 100, reason: why.length ? why.join(', ').replace(/^./, (c) => c.toUpperCase()) : 'A good fit for the competition' };
}
// Without Rekognition: how sharp the picture is (sharp's own measure), as the score
async function sharpness(buf) {
  const s = await sharp(buf).greyscale().stats();
  return Math.round((s.sharpness || 0) * 100) / 100;
}
export async function shortlist(album, roundId) {
  const { hostRound, forgetGames } = await games();
  const round = await hostRound(album, roundId);
  if (round.type !== 'contest' || round.status !== 'live') throw new HttpError(409, 'Only an open competition can be shortlisted.', 'GAME_STATE');
  const entries = await ContestEntry.find({ round: round._id });
  if (!entries.length) throw new HttpError(409, 'Nobody has entered yet.', 'GAME_NO_ENTRIES');
  const rk = await import('./rekognitionService.js');
  let ai = true;
  for (const e of entries) {
    const buf = await streamToBuffer(await openPhoto(e.key));
    try {
      if (!ai) throw new Error('no AI');
      Object.assign(e, scoreEntry(round.title, await rk.describe(buf)));
    } catch (error) {
      if (ai) console.error(`Competition shortlist: Rekognition unavailable (${error.message}); using sharpness instead`);
      ai = false;
      e.score = await sharpness(buf); e.reason = 'One of the sharpest photos (picked without AI)';
    }
    await e.save();
  }
  // Without AI every entry gets the sharpness score: rescore those that got AI ones before it failed
  if (!ai) for (const e of entries.filter((x) => !x.reason?.includes('without AI'))) {
    e.score = await sharpness(await streamToBuffer(await openPhoto(e.key))); e.reason = 'One of the sharpest photos (picked without AI)'; await e.save();
  }
  const eligible = entries.filter((e) => (e.level ?? 0) < SHORTLIST_MAX_LEVEL).sort((a, b) => b.score - a.score);
  const n = Math.min(eligible.length, Math.max(MIN_FINALISTS, Math.min(MAX_FINALISTS, Math.ceil(eligible.length / 2))));
  const finalists = eligible.slice(0, n).map((e) => ({ entry: String(e._id), score: e.score, reason: e.reason }));
  await GameRound.updateOne({ _id: round._id }, { $set: { 'settings.phase': 'judging', 'settings.finalists': finalists, 'settings.ai': ai } });
  forgetGames(album._id);
  return { finalists, ai };
}

// ---- The podium: 1st, 2nd, 3rd (different people's entries) ----
export async function setPodium(album, roundId, body = {}) {
  const { hostRound, forgetGames, PODIUM } = await games();
  const round = await hostRound(album, roundId);
  if (round.type !== 'contest' || round.status !== 'live') throw new HttpError(409, 'Only an open competition can be judged.', 'GAME_STATE');
  const picks = [body.first, body.second, body.third].filter((x) => x != null);
  if (!picks.length || new Set(picks.map(String)).size !== picks.length || !picks.every((x) => mongoose.isValidObjectId(x))) {
    throw new HttpError(400, 'Choose different entries for 1st, 2nd and 3rd.', 'GAME_INVALID');
  }
  const found = await ContestEntry.find({ _id: { $in: picks }, round: round._id }).lean();
  if (found.length !== picks.length) throw new HttpError(404, 'Those entries aren’t in this competition.', 'GAME_NOT_FOUND');
  const byId = new Map(found.map((e) => [String(e._id), e]));
  const users = picks.map((p) => String(byId.get(String(p)).user));
  if (new Set(users).size !== users.length) throw new HttpError(400, 'Choose entries from different people for each place.', 'GAME_INVALID');
  await GameAward.deleteMany({ round: round._id });
  for (const [i, p] of picks.entries()) {
    await GameAward.create({ round: round._id, album: album._id, user: byId.get(String(p)).user, place: i + 1, points: PODIUM[i] });
  }
  await GameRound.updateOne({ _id: round._id }, { $set: { 'settings.podium': picks.map(String), 'settings.phase': 'judging' } });
  forgetGames(album._id);
  return { podium: picks.map(String) };
}

// ---- The end: keep the top 10 (moved to minigames-top10/), delete the rest ----
export async function finishContest(round) {
  const entries = await ContestEntry.find({ round: round._id });
  const podium = (round.settings.podium || []).map(String);
  const ranked = [...entries].sort((a, b) => {
    const pa = podium.indexOf(String(a._id)), pb = podium.indexOf(String(b._id));
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    const la = (a.level ?? 0) >= SHORTLIST_MAX_LEVEL, lb = (b.level ?? 0) >= SHORTLIST_MAX_LEVEL;   // never above a shortlistable one
    return (la - lb) || ((b.score ?? -1) - (a.score ?? -1)) || (a.createdAt - b.createdAt);
  });
  const keep = ranked.slice(0, KEEP_TOP).filter((e) => (e.level ?? 0) < SHORTLIST_MAX_LEVEL || podium.includes(String(e._id)));
  const drop = ranked.filter((e) => !keep.includes(e));
  for (const [i, e] of keep.entries()) {
    const key = `minigames-top10/${round.album}/${round._id}/${e._id}.jpg`, thumbKey = `${key}.thumb.webp`;
    if (!e.key.startsWith('minigames-top10/')) {
      await saveFile(key, await streamToBuffer(await openPhoto(e.key)), e.mime || 'image/jpeg');
      await saveFile(thumbKey, await streamToBuffer(await openPhoto(e.thumbKey)), 'image/webp');
      await dropFiles([e]);
    }
    await ContestEntry.updateOne({ _id: e._id }, { $set: { key, thumbKey, kept: true, rank: i + 1 } });
  }
  await dropFiles(drop);
  await ContestEntry.deleteMany({ _id: { $in: drop.map((e) => e._id) } });
  return { kept: keep.length, deleted: drop.length };
}

// Hourly: competitions still open CONTEST_HOURS after they started are ended (top 10 kept, the rest deleted)
export async function sweepContests(now = new Date()) {
  const { endRound } = await games();
  const stale = await GameRound.find({ type: 'contest', status: 'live', startedAt: { $lt: new Date(now - CONTEST_HOURS * 3600000) } }).limit(20);
  let ended = 0;
  for (const r of stale) {
    const album = await Album.findById(r.album);
    if (album) { await endRound(album, r._id); ended++; }
  }
  return { ended };
}

// ---- What the event sees ----
export async function entriesFor(albumId) {
  return ContestEntry.find({ album: albumId }).lean();
}
export function contestView(round, entries, userId, host, names) {
  const me = String(userId), s = round.settings;
  const mine = entries.filter((e) => String(e.user) === me);
  const name = (e) => (String(e.user) === me ? 'You' : (names?.get(String(e.user)) || 'Guest'));
  const finalists = (s.finalists || []).map((f) => {
    const e = entries.find((x) => String(x._id) === f.entry);
    return e && { entry: f.entry, score: f.score, reason: f.reason, by: name(e), mine: String(e.user) === me, ...links(round, e) };
  }).filter(Boolean);
  const podium = (s.podium || []).map((id, i) => {
    const e = entries.find((x) => String(x._id) === id);
    return e && { place: i + 1, entry: id, by: name(e), mine: String(e.user) === me, ...links(round, e) };
  }).filter(Boolean);
  return {
    phase: round.status === 'ended' ? 'ended' : s.phase, maxEntries: s.maxEntries, entries: entries.length, ai: s.ai ?? null,
    myEntries: mine.map((e) => ({ id: String(e._id), ...links(round, e) })),
    canEnter: round.status === 'live' && s.phase === 'entries' && mine.length < s.maxEntries,
    // Finalists and the podium are public once chosen; every entry only for the host while it's open; the kept top 10 after
    finalists, podium,
    ...(host && round.status === 'live' && { all: entries.map((e) => ({ id: String(e._id), by: name(e), level: e.level ?? 0, score: e.score ?? null, ...links(round, e) })) }),
    ...(round.status === 'ended' && { top: entries.filter((e) => e.kept).sort((a, b) => a.rank - b.rank)
      .map((e) => ({ rank: e.rank, entry: String(e._id), by: name(e), mine: String(e.user) === me, ...links(round, e) })) }),
  };
}

// The picture of one entry (members of the event; while it's open, only its owner, the host, or once shortlisted)
export async function entryImage(album, roundId, entryId, userId, host, size) {
  if (!mongoose.isValidObjectId(roundId) || !mongoose.isValidObjectId(entryId)) throw new HttpError(404, 'Not found.', 'GAME_NOT_FOUND');
  const [round, e] = await Promise.all([GameRound.findOne({ _id: roundId, album: album._id }).lean(), ContestEntry.findOne({ _id: entryId, round: roundId }).lean()]);
  if (!round || !e) throw new HttpError(404, 'Not found.', 'GAME_NOT_FOUND');
  const visible = host || String(e.user) === String(userId) || round.status === 'ended'
    || (round.settings.finalists || []).some((f) => f.entry === String(e._id)) || (round.settings.podium || []).includes(String(e._id));
  if (!visible) throw new HttpError(404, 'Not found.', 'GAME_NOT_FOUND');
  return size === 'thumb' ? { key: e.thumbKey, mime: 'image/webp' } : { key: e.key, mime: e.mime || 'image/jpeg' };
}

// ---- Clean-up ----
export async function removeContestEntries(filter) {
  const entries = await ContestEntry.find(filter, 'key thumbKey').lean();
  await dropFiles(entries);
  await ContestEntry.deleteMany(filter);
}
