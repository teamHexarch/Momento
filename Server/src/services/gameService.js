// Event mini-games: polls and trivia (more games are added as their own types). Album members play; the host
// creates, starts, moves on and ends each round. Pages ask for the state every 2-4 seconds; the state of an album's
// games is built at most once every 2 seconds (STATE_MS) whoever asks, so 100+ guests polling cost one set of
// database reads per album every 2 seconds. Scoring:
//   poll:   10 points for taking part (a vote can be changed while the poll is open)
//   trivia: 100 points for a right answer, plus up to 50 for answering quickly; one answer per question
//   battle: 2 points per vote (the first 10 votes in a battle); when it ends, the people whose photos came 1st, 2nd and
//           3rd get 100, 60 and 30 (PODIUM). Photos are ranked by an Elo rating from the head-to-head votes.
//   bingo:  10 points per tile claimed with a photo, 30 more for each full line (row, column or diagonal), 100 more for
//           the full card. Line and card points are worked out from the claims, so they always follow them.
//   contest: a host-judged photo competition (services/contestService.js): the podium gets 100, 60 and 30
//   crop:   mystery crop: a photo starts as a close-up of one detail and zooms out in 3 stages over its time; a right
//           guess scores 150 on the close-up, 100 on the middle zoom, 50 once the whole photo shows. One guess each.
// The leaderboard adds up every response's points and the host's awards (podium places) in the album.
import mongoose from 'mongoose';
import { GameRound, GameResponse, GameAward, GameEntry, GameVote, GAME_TYPES } from '../models/Game.js';
import { User } from '../models/User.js';
import { Photo } from '../models/Photo.js';
import { config } from '../config/env.js';
import * as contest from './contestService.js';
import { HttpError } from '../utils/httpError.js';
import { cleanText, LIMITS } from '../utils/text.js';

export const STATE_MS = 2000;
export const POLL_POINTS = 10, RIGHT_POINTS = 100, SPEED_POINTS = 50;
export const VOTE_POINTS = 2, POINTED_VOTES = 10, PODIUM = [100, 60, 30];
export const TILE_POINTS = 10, LINE_POINTS = 30, CARD_POINTS = 100;
export const CROP_POINTS = [150, 100, 50];
// How much of the photo each stage shows (a fraction of its width and height)
export const CROP_STAGES = [0.2, 0.5, 1];
// Prompts for a card the host doesn't write themselves
export const DEFAULT_PROMPTS = ['Candid laugh', 'Group toast', 'Best dance move', 'The cake', 'A selfie with the host', 'Someone mid-speech',
  'Matching outfits', 'The venue from outside', 'A happy tear', 'Three generations', 'The best shoes', 'A photo-bomb', 'Something blue',
  'The first dance', 'A group hug', 'The last ones standing'];
const MAX_ROUNDS_PER_ALBUM = 100;

// ---- Reading what the host sends ----
function readPoll(b) {
  const question = cleanText(b.question, { max: LIMITS.description, what: 'The question', required: true });
  const raw = Array.isArray(b.options) ? b.options : [];
  if (raw.length < 2 || raw.length > 6) throw new HttpError(400, 'A poll needs 2 to 6 options.', 'GAME_INVALID');
  const options = raw.map((o, i) => ({ id: i, text: cleanText(o, { max: LIMITS.title, what: `Option ${i + 1}`, required: true }) }));
  return { question, options };
}
function readTrivia(b) {
  const raw = Array.isArray(b.questions) ? b.questions : [];
  if (raw.length < 1 || raw.length > 20) throw new HttpError(400, 'A trivia round has 1 to 20 questions.', 'GAME_INVALID');
  const questions = raw.map((q, n) => {
    const text = cleanText(q?.text, { max: LIMITS.description, what: `Question ${n + 1}`, required: true });
    const opts = Array.isArray(q?.options) ? q.options : [];
    if (opts.length < 2 || opts.length > 4) throw new HttpError(400, `Question ${n + 1} needs 2 to 4 answers.`, 'GAME_INVALID');
    const options = opts.map((o, i) => cleanText(o, { max: LIMITS.title, what: `Question ${n + 1}, answer ${i + 1}`, required: true }));
    const answer = Number(q?.answer);
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) throw new HttpError(400, `Choose the right answer for question ${n + 1}.`, 'GAME_INVALID');
    const seconds = q?.seconds === undefined ? 20 : Number(q.seconds);
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120) throw new HttpError(400, 'Give each question 5 to 120 seconds.', 'GAME_INVALID');
    return { text, options, answer, seconds };
  });
  return { questions, current: -1 };
}
function readBattle(b) {
  const maxEntries = b.maxEntries === undefined ? 1 : Number(b.maxEntries);
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 5) throw new HttpError(400, 'Allow 1 to 5 photos per person.', 'GAME_INVALID');
  return { maxEntries };
}
function readBingo(b) {
  const size = b.size === undefined ? 3 : Number(b.size);
  if (size !== 3 && size !== 4) throw new HttpError(400, 'A bingo card is 3 x 3 or 4 x 4.', 'GAME_INVALID');
  const n = size * size;
  if (b.prompts === undefined) return { size, prompts: DEFAULT_PROMPTS.slice(0, n) };
  if (!Array.isArray(b.prompts) || b.prompts.length !== n) throw new HttpError(400, `A ${size} x ${size} card needs ${n} prompts.`, 'GAME_INVALID');
  const prompts = b.prompts.map((t, i) => cleanText(t, { max: LIMITS.description, what: `Prompt ${i + 1}`, required: true }));
  return { size, prompts };
}
// Mystery crop: the host's photos (photo ids from the event) or { auto: n } random ones, 1-10. Each one asks
// "Whose photo is this?" (the photographer and up to 3 other people with photos in the event, made automatically),
// unless the host gives their own { question, options, answer }.
const firstOf = (name) => (name || '').trim().split(/\s+/)[0] || 'Guest';
const shuffle = (list) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
async function readCrop(b, album) {
  const seconds = b.seconds === undefined ? 30 : Number(b.seconds);
  if (!Number.isInteger(seconds) || seconds < 15 || seconds > 120) throw new HttpError(400, 'Give each photo 15 to 120 seconds.', 'GAME_INVALID');
  let items;
  if (b.auto !== undefined) {
    const n = Number(b.auto);
    if (!Number.isInteger(n) || n < 1 || n > 10) throw new HttpError(400, 'Choose 1 to 10 photos.', 'GAME_INVALID');
    const pool = await Photo.find({ album: album._id, ...SHOWN }, '_id').lean();
    if (!pool.length) throw new HttpError(409, 'This event has no photos yet.', 'GAME_NO_PHOTOS');
    items = shuffle(pool).slice(0, n).map((p) => ({ photo: p._id }));
  } else {
    items = Array.isArray(b.photos) ? b.photos : [];
    if (items.length < 1 || items.length > 10) throw new HttpError(400, 'Choose 1 to 10 photos.', 'GAME_INVALID');
    items = items.map((x) => (typeof x === 'string' ? { photo: x } : x || {}));
  }
  const ids = items.map((x) => x.photo);
  if (!ids.every((id) => mongoose.isValidObjectId(id))) throw new HttpError(400, 'Choose photos from this event.', 'GAME_INVALID');
  const photos = new Map((await Photo.find({ _id: { $in: ids }, album: album._id, ...SHOWN }, 'uploader').lean()).map((p) => [String(p._id), p]));
  if (photos.size !== new Set(ids.map(String)).size) throw new HttpError(404, 'Some of those photos aren\u2019t in this event.', 'GAME_PHOTO_NOT_FOUND');
  // The people with photos in the event, for "Whose photo is this?"
  const uploaders = await Photo.distinct('uploader', { album: album._id, ...SHOWN });
  const people = new Map((await User.find({ _id: { $in: uploaders } }, 'name').lean()).map((u) => [String(u._id), firstOf(u.name)]));
  const questions = items.map((x, n) => {
    const focus = { x: 0.25 + Math.random() * 0.5, y: 0.25 + Math.random() * 0.5 };
    const base = { photo: photos.get(String(x.photo))._id, focus, seconds };
    if (x.question !== undefined) {
      const text = cleanText(x.question, { max: LIMITS.description, what: `Photo ${n + 1}'s question`, required: true });
      const opts = Array.isArray(x.options) ? x.options : [];
      if (opts.length < 2 || opts.length > 4) throw new HttpError(400, `Photo ${n + 1} needs 2 to 4 answers.`, 'GAME_INVALID');
      const options = opts.map((o, i) => cleanText(o, { max: LIMITS.title, what: `Photo ${n + 1}, answer ${i + 1}`, required: true }));
      const answer = Number(x.answer);
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) throw new HttpError(400, `Choose the right answer for photo ${n + 1}.`, 'GAME_INVALID');
      return { ...base, text, options, answer };
    }
    const right = people.get(String(photos.get(String(x.photo)).uploader)) || 'Guest';
    const others = shuffle([...new Set([...people.values()].filter((name) => name !== right))]).slice(0, 3);
    if (!others.length) throw new HttpError(409, '"Whose photo is this?" needs photos from at least 2 people. Add your own question instead.', 'GAME_NOT_ENOUGH_PEOPLE');
    const options = shuffle([right, ...others]);
    return { ...base, text: 'Whose photo is this?', options, answer: options.indexOf(right) };
  });
  return { questions, current: -1 };
}
const READERS = { poll: readPoll, trivia: readTrivia, battle: readBattle, bingo: readBingo, crop: readCrop, contest: contest.readContest };

// ---- Time limits: polls, battles and bingo can end by themselves ----
// (quizzes and mystery crop run on their own clocks, question by question; a competition ends once the host picks winners)
export const TIMED_TYPES = new Set(['poll', 'battle', 'bingo']);
export const MAX_MINUTES = 24 * 60;
// body.minutes: 1 to 1440; body.untilEventEnds: true (ends with the event). Neither: no limit (the host ends it).
function readTimeLimit(type, body, album) {
  if (!TIMED_TYPES.has(type)) return {};
  if (body.untilEventEnds === true) {
    if (!album.endsAt) throw new HttpError(400, 'This event has no end time. Choose a number of minutes instead.', 'GAME_INVALID');
    return { untilEventEnds: true };
  }
  if (body.minutes === undefined || body.minutes === null || body.minutes === '' || body.minutes === 0) return {};
  const minutes = Number(body.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) throw new HttpError(400, 'Give the game 1 minute to 24 hours, or no time limit.', 'GAME_INVALID');
  return { minutes };
}
// When a game that's starting now runs out of time (null: no limit)
function endsAtFor(round, album, now = new Date()) {
  const s = round.settings || {};
  if (s.untilEventEnds && album.endsAt) return new Date(Math.max(now.getTime() + 60000, new Date(album.endsAt).getTime()));
  if (s.minutes) return new Date(now.getTime() + s.minutes * 60000);
  return null;
}

export async function createRound(album, user, body = {}) {
  const type = body.type;
  if (!GAME_TYPES.includes(type)) throw new HttpError(400, `Choose a game: ${GAME_TYPES.join(', ')}.`, 'GAME_INVALID');
  if (await GameRound.countDocuments({ album: album._id }) >= MAX_ROUNDS_PER_ALBUM) throw new HttpError(409, 'This album has a lot of games already. Delete some first.', 'GAME_LIMIT');
  const title = cleanText(body.title, { max: LIMITS.title, what: 'The name', required: true });
  const settings = { ...(await READERS[type](body, album)), ...readTimeLimit(type, body, album) };
  const round = await GameRound.create({ album: album._id, type, title, createdBy: user._id, settings });
  forget(album._id);
  if (body.start === true) return startRound(album, round._id);
  return round;
}

// ---- The host runs a round ----
export async function hostRound(album, roundId) {
  if (!mongoose.isValidObjectId(roundId)) throw new HttpError(404, 'Game not found.', 'GAME_NOT_FOUND');
  const round = await GameRound.findOne({ _id: roundId, album: album._id });
  if (!round) throw new HttpError(404, 'Game not found.', 'GAME_NOT_FOUND');
  return round;
}
export async function startRound(album, roundId) {
  const round = await hostRound(album, roundId);
  if (round.status !== 'draft') throw new HttpError(409, 'This game has already started.', 'GAME_STATE');
  const set = { status: 'live', startedAt: new Date() };
  const endsAt = endsAtFor(round, album, set.startedAt);
  if (endsAt) set.endsAt = endsAt;
  if (round.type === 'trivia' || round.type === 'crop') Object.assign(set, { 'settings.current': 0, 'settings.currentAt': new Date() });
  await GameRound.updateOne({ _id: round._id, status: 'draft' }, { $set: set });
  forget(album._id);
  return GameRound.findById(round._id);
}
// Trivia and mystery crop: on to the next question or photo (the last one ends the round)
export async function nextQuestion(album, roundId) {
  const round = await hostRound(album, roundId);
  if (!['trivia', 'crop'].includes(round.type) || round.status !== 'live') throw new HttpError(409, 'Only a live trivia or mystery crop round has a next one.', 'GAME_STATE');
  const next = round.settings.current + 1;
  if (next >= round.settings.questions.length) return endRound(album, roundId);
  await GameRound.updateOne({ _id: round._id, 'settings.current': round.settings.current }, { $set: { 'settings.current': next, 'settings.currentAt': new Date() } });
  forget(album._id);
  return GameRound.findById(round._id);
}
export async function endRound(album, roundId) {
  const round = await hostRound(album, roundId);
  if (round.status === 'ended') return round;
  const ended = await GameRound.updateOne({ _id: round._id, status: { $ne: 'ended' } }, { $set: { status: 'ended', endedAt: new Date() } });
  // A battle: the podium (the best-placed photo of each person; one place per person, only photos that got votes)
  if (ended.modifiedCount && round.type === 'battle') {
    const standings = await battleStandings(round._id);
    const placed = [];
    for (const e of standings) {
      if (placed.length >= PODIUM.length) break;
      if (!e.votes || placed.some((p) => p.user === e.user)) continue;
      placed.push(e);
    }
    for (const [i, e] of placed.entries()) {
      await GameAward.updateOne({ round: round._id, user: e.user }, { $setOnInsert: { album: album._id, place: i + 1, points: PODIUM[i] } }, { upsert: true });
    }
  }
  // A competition: keep the top 10, delete the rest (services/contestService.js)
  if (ended.modifiedCount && round.type === 'contest') await contest.finishContest(round);
  // The winners: saved on the game (for the celebration and the event's wins board) and told they won
  if (ended.modifiedCount) await crownWinners(album, round).catch((err) => console.error(`Game winners failed: ${err.message}`));
  forget(album._id);
  return GameRound.findById(round._id);
}

// ---- Winners ----
// Each person's points in one game: their answers, votes and claims (bingo with its line and card bonuses) and the
// host's awards (podium places in battles and competitions)
export async function roundPoints(round) {
  const [responses, awards] = await Promise.all([
    GameResponse.find({ round: round._id }, 'user q points photo').lean(),
    GameAward.find({ round: round._id }, 'user points').lean(),
  ]);
  const photoIds = responses.filter((r) => r.photo).map((r) => r.photo);
  const shown = photoIds.length ? new Set((await Photo.find({ _id: { $in: photoIds }, ...SHOWN }, '_id').lean()).map((p) => String(p._id))) : new Set();
  const totals = new Map(), tiles = new Map();
  const add = (u, n) => totals.set(String(u), (totals.get(String(u)) || 0) + (n || 0));
  for (const r of responses) {
    if (r.photo && !shown.has(String(r.photo))) continue;
    if (round.type === 'bingo') { if (!tiles.has(String(r.user))) tiles.set(String(r.user), []); tiles.get(String(r.user)).push(r.q); }
    else add(r.user, r.points);
  }
  for (const [u, t] of tiles) add(u, bingoScore(round.settings.size, t).points);
  for (const a of awards) add(a.user, a.points);
  return totals;
}
// Places from points: ties share a place (two on 120 are both 1st; the next is 3rd). Only people who scored.
export function rankPlaces(totals, top = 3) {
  const rows = [...totals.entries()].filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]);
  return rows.map(([user, points]) => ({ user, points, place: 1 + rows.filter(([, p]) => p > points).length }))
    .filter((r) => r.place <= top).slice(0, 12);
}
// A poll is a vote, not a contest: nobody wins it
async function crownWinners(album, round) {
  if (round.type === 'poll') return;
  const fresh = await GameRound.findById(round._id).lean();
  const places = rankPlaces(await roundPoints(fresh));
  const names = new Map((await User.find({ _id: { $in: places.map((p) => p.user) } }, 'name').lean()).map((u) => [String(u._id), firstOf(u.name)]));
  const podium = places.map((p) => ({ user: new mongoose.Types.ObjectId(p.user), name: names.get(p.user) || 'Guest', points: p.points, place: p.place }));
  await GameRound.updateOne({ _id: round._id }, { $set: { podium } });
  const { notify } = await import('./notifyService.js');
  for (const w of podium.filter((p) => p.place === 1)) {
    await notify({ user: w.user, type: 'game-won', album: album._id, game: round._id, gameTitle: fresh.title });
  }
}

// ---- Time's up: live games past their endsAt are ended (server.js runs this every few seconds; the state pages ask
// for also ends an album's own as soon as anyone looks, so a game never stays live long past its time) ----
let sweeping = null;
export async function endDueRounds({ album, now = new Date() } = {}) {
  const filter = { status: 'live', endsAt: { $lte: now }, ...(album && { album }) };
  const due = await GameRound.find(filter, 'album').limit(50).lean();
  let ended = 0;
  const { Album } = await import('../models/Album.js');
  for (const r of due) {
    const a = await Album.findById(r.album);
    if (!a) continue;
    try { await endRound(a, r._id); ended++; } catch (err) { console.error(`Ending a timed game failed: ${err.message}`); }
  }
  return { ended };
}
// One sweep at a time across the server (a slow database doesn't pile them up)
export function sweepTimedGames() {
  if (!sweeping) sweeping = endDueRounds().catch((err) => console.error(`Timed games sweep failed: ${err.message}`)).finally(() => { sweeping = null; });
  return sweeping;
}
export async function removeRound(album, roundId) {
  const round = await hostRound(album, roundId);
  await Promise.all([GameResponse.deleteMany({ round: round._id }), GameAward.deleteMany({ round: round._id }),
    GameEntry.deleteMany({ round: round._id }), GameVote.deleteMany({ round: round._id }), GameRound.deleteOne({ _id: round._id }),
    contest.removeContestEntries({ round: round._id })]);
  forget(album._id);
}

// ---- Playing ----
export async function liveRound(album, roundId, type) {
  if (!mongoose.isValidObjectId(roundId)) throw new HttpError(404, 'Game not found.', 'GAME_NOT_FOUND');
  const round = await GameRound.findOne({ _id: roundId, album: album._id }).lean();
  if (!round || round.type !== type) throw new HttpError(404, 'Game not found.', 'GAME_NOT_FOUND');
  if (round.status !== 'live') throw new HttpError(409, round.status === 'ended' ? 'This game has finished.' : 'This game hasn’t started yet.', 'GAME_NOT_LIVE');
  return round;
}
export async function vote(album, user, roundId, body = {}) {
  const round = await liveRound(album, roundId, 'poll');
  const choice = Number(body.option);
  if (!round.settings.options.some((o) => o.id === choice)) throw new HttpError(400, 'Choose one of the options.', 'GAME_INVALID');
  await GameResponse.updateOne({ round: round._id, user: user._id, q: 0 },
    { $set: { choice }, $setOnInsert: { album: album._id, points: POLL_POINTS } }, { upsert: true });
  return { round: round._id, choice };
}
// Which zoom stage a mystery crop photo is at: 0 (close-up), 1, 2 (the whole photo), by the time since it came up
export function cropStage(question, currentAt, now = Date.now()) {
  const part = (question.seconds * 1000) / CROP_STAGES.length;
  return Math.min(CROP_STAGES.length - 1, Math.max(0, Math.floor((now - new Date(currentAt).getTime()) / part)));
}
// Trivia and mystery crop: an answer to the question (or photo) on screen, within its time; one per question
export async function answer(album, user, roundId, body = {}, type = 'trivia') {
  const round = await liveRound(album, roundId, type);
  const { questions, current, currentAt } = round.settings;
  const q = Number(body.question);
  if (q !== current) throw new HttpError(409, 'That question isn’t being asked now.', 'GAME_STATE');
  const question = questions[q];
  const choice = Number(body.option);
  if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) throw new HttpError(400, 'Choose one of the answers.', 'GAME_INVALID');
  const left = new Date(currentAt).getTime() + question.seconds * 1000 - Date.now();
  if (left <= 0) throw new HttpError(409, 'Time’s up for this question.', 'GAME_TIME_UP');
  const correct = choice === question.answer;
  const points = !correct ? 0 : type === 'crop' ? CROP_POINTS[cropStage(question, currentAt)]
    : RIGHT_POINTS + Math.round(SPEED_POINTS * Math.min(1, left / (question.seconds * 1000)));
  try {
    await GameResponse.create({ round: round._id, album: album._id, user: user._id, q, choice, correct, points });
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'You’ve already answered this question.', 'GAME_ANSWERED');
    throw error;
  }
  return { question: q, choice, correct, points };
}

// ---- Mystery crop: the picture for the photo on screen, at its current zoom only (never further) ----
const crops = new Map();
export async function cropImage(album, roundId) {
  const round = await liveRound(album, roundId, 'crop');
  const { questions, current, currentAt } = round.settings;
  const q = questions[current];
  const stage = cropStage(q, currentAt);
  const key = `${round._id}:${current}:${stage}`;
  if (crops.has(key)) return { image: crops.get(key), stage };
  const photo = await Photo.findOne({ _id: q.photo, album: album._id, ...SHOWN }, 'previewKey storageKey').lean();
  if (!photo) throw new HttpError(404, 'That photo is no longer in the event.', 'GAME_PHOTO_NOT_FOUND');
  const { openPhoto } = await import('./storageService.js');
  const { buffer } = await import('node:stream/consumers');
  const sharp = (await import('sharp')).default;
  const source = await buffer(await openPhoto(photo.previewKey || photo.storageKey));
  const meta = await sharp(source).rotate().toBuffer({ resolveWithObject: true });
  const { width, height } = meta.info, part = CROP_STAGES[stage];
  const w = Math.max(1, Math.round(width * part)), h = Math.max(1, Math.round(height * part));
  const left = Math.min(width - w, Math.max(0, Math.round(width * q.focus.x - w / 2)));
  const top = Math.min(height - h, Math.max(0, Math.round(height * q.focus.y - h / 2)));
  const image = await sharp(meta.data).extract({ left, top, width: w, height: h })
    .resize({ width: 1024, height: 1024, fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
  crops.set(key, image);
  if (crops.size > 40) crops.delete(crops.keys().next().value);
  return { image, stage };
}

// ---- Photo battle ----
const photoLinks = (id) => ({ url: `${config.publicUrl}/api/photos/${id}`, thumbnailUrl: `${config.publicUrl}/api/photos/${id}?size=thumb`,
  miniUrl: `${config.publicUrl}/api/photos/${id}?size=mini` });
const pairOf = (a, b) => [String(a), String(b)].sort().join(':');
const SHOWN = { deletedAt: null, flaggedAt: null, auditHidden: { $ne: true } };
// Entries whose photo is still shown in the album (deleted, binned or hidden photos drop out)
async function liveEntries(roundId) {
  const entries = await GameEntry.find({ round: roundId }).lean();
  const ok = new Set((await Photo.find({ _id: { $in: entries.map((e) => e.photo) }, ...SHOWN }, '_id').lean()).map((p) => String(p._id)));
  return entries.filter((e) => ok.has(String(e.photo)));
}
// Elo ratings from the votes in order (everyone starts at 1000; K 32), then wins, losses and rank
export function rate(entries, votes) {
  const r = new Map(entries.map((e) => [String(e.photo), { ...e, rating: 1000, wins: 0, losses: 0 }]));
  for (const v of [...votes].sort((a, b) => new Date(a.at) - new Date(b.at))) {
    const w = r.get(String(v.winner)), l = r.get(String(v.loser));
    if (!w || !l) continue;
    const expected = 1 / (1 + 10 ** ((l.rating - w.rating) / 400));
    w.rating += 32 * (1 - expected); l.rating -= 32 * (1 - expected);
    w.wins++; l.losses++;
  }
  return [...r.values()].map((e) => ({ ...e, rating: Math.round(e.rating), votes: e.wins + e.losses }))
    .sort((a, b) => (b.rating - a.rating) || (b.wins - a.wins) || (new Date(a.at) - new Date(b.at)))
    .map((e, i) => ({ ...e, rank: i + 1, user: String(e.user) }));
}
async function battleStandings(roundId) {
  const [entries, votes] = await Promise.all([liveEntries(roundId), GameVote.find({ round: roundId }, 'winner loser at').lean()]);
  return rate(entries, votes);
}

// Enter one of your own photos from this event (up to the battle's maxEntries)
export async function enterPhoto(album, user, roundId, body = {}) {
  const round = await liveRound(album, roundId, 'battle');
  if (!mongoose.isValidObjectId(body.photo)) throw new HttpError(400, 'Choose one of your photos.', 'GAME_INVALID');
  const photo = await Photo.findOne({ _id: body.photo, album: album._id, ...SHOWN }, 'uploader').lean();
  if (!photo) throw new HttpError(404, 'That photo isn’t in this event.', 'GAME_PHOTO_NOT_FOUND');
  if (!photo.uploader?.equals(user._id)) throw new HttpError(403, 'You can enter the photos you added.', 'GAME_PHOTO_NOT_YOURS');
  const max = round.settings.maxEntries;
  if (await GameEntry.countDocuments({ round: round._id, user: user._id }) >= max) {
    throw new HttpError(409, `You can enter up to ${max} photo${max === 1 ? '' : 's'} in this battle.`, 'GAME_ENTRY_LIMIT');
  }
  try { await GameEntry.create({ round: round._id, album: album._id, user: user._id, photo: photo._id }); }
  catch (error) { if (error.code !== 11000) throw error; }
  forget(album._id);
  return { entered: String(photo._id) };
}
export async function withdrawPhoto(album, user, roundId, photoId) {
  const round = await liveRound(album, roundId, 'battle');
  if (!mongoose.isValidObjectId(photoId)) throw new HttpError(404, 'That photo isn’t in this battle.', 'GAME_PHOTO_NOT_FOUND');
  const gone = await GameEntry.deleteOne({ round: round._id, photo: photoId, user: user._id });
  if (!gone.deletedCount) throw new HttpError(404, 'That photo isn’t in this battle.', 'GAME_PHOTO_NOT_FOUND');
  await GameVote.deleteMany({ round: round._id, $or: [{ winner: photoId }, { loser: photoId }] });
  forget(album._id);
  return { ok: true };
}
const pairView = (a, b) => [a, b].map((e) => ({ photo: String(e.photo), ...photoLinks(e.photo) }));
// Two entries to choose between: never your own, never a pair you've voted on. null when you've seen them all.
export async function nextPair(album, user, roundId) {
  const round = await liveRound(album, roundId, 'battle');
  const entries = (await liveEntries(round._id)).filter((e) => !e.user.equals(user._id));
  if (entries.length < 2) return { pair: null, reason: 'not-enough-photos' };
  const done = new Set((await GameVote.find({ round: round._id, user: user._id }, 'pair').lean()).map((v) => v.pair));
  // Random pairs first (quick for big battles); then every pair in turn, so the last unvoted one is still found
  for (let i = 0; i < 40; i++) {
    const a = entries[Math.floor(Math.random() * entries.length)], b = entries[Math.floor(Math.random() * entries.length)];
    if (a !== b && !done.has(pairOf(a.photo, b.photo))) return { pair: pairView(a, b) };
  }
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    if (!done.has(pairOf(entries[i].photo, entries[j].photo))) return { pair: pairView(entries[i], entries[j]) };
  }
  return { pair: null, reason: 'all-voted' };
}
export async function battleVote(album, user, roundId, body = {}) {
  const round = await liveRound(album, roundId, 'battle');
  const { winner, loser } = body;
  if (!mongoose.isValidObjectId(winner) || !mongoose.isValidObjectId(loser) || String(winner) === String(loser)) throw new HttpError(400, 'Choose one of the two photos.', 'GAME_INVALID');
  const entries = await liveEntries(round._id);
  const w = entries.find((e) => String(e.photo) === String(winner)), l = entries.find((e) => String(e.photo) === String(loser));
  if (!w || !l) throw new HttpError(404, 'One of those photos is no longer in the battle.', 'GAME_PHOTO_NOT_FOUND');
  if (w.user.equals(user._id) || l.user.equals(user._id)) throw new HttpError(403, 'You can’t vote on your own photos.', 'GAME_OWN_PHOTO');
  try { await GameVote.create({ round: round._id, album: album._id, user: user._id, winner: w.photo, loser: l.photo, pair: pairOf(w.photo, l.photo) }); }
  catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'You’ve already voted on these two.', 'GAME_ANSWERED');
    throw error;
  }
  // Points for the first POINTED_VOTES votes (one response per vote number, so they can't be counted twice)
  const n = await GameVote.countDocuments({ round: round._id, user: user._id });
  if (n <= POINTED_VOTES) {
    await GameResponse.updateOne({ round: round._id, user: user._id, q: n }, { $setOnInsert: { album: album._id, choice: 0, points: VOTE_POINTS } }, { upsert: true }).catch(() => {});
  }
  return { voted: true, votes: n, points: n <= POINTED_VOTES ? VOTE_POINTS : 0 };
}

// ---- Scavenger bingo ----
// Every line on a card: rows, columns and the two diagonals (tile numbers, row by row)
export function linesOf(size) {
  const rows = [], cols = [];
  for (let i = 0; i < size; i++) { rows.push([]); cols.push([]); for (let j = 0; j < size; j++) { rows[i].push(i * size + j); cols[i].push(j * size + i); } }
  return [...rows, ...cols, Array.from({ length: size }, (_, i) => i * size + i), Array.from({ length: size }, (_, i) => i * size + size - 1 - i)];
}
// Points for one person's tiles: per tile, per full line, and the full card
export function bingoScore(size, tiles) {
  const have = new Set(tiles);
  const lines = linesOf(size).filter((l) => l.every((t) => have.has(t))).length;
  const full = have.size === size * size;
  return { tiles: have.size, lines, full, points: have.size * TILE_POINTS + lines * LINE_POINTS + (full ? CARD_POINTS : 0) };
}
// Claim a tile with one of your own event photos (or swap the photo on a tile you've claimed). A photo counts once.
export async function claimTile(album, user, roundId, body = {}) {
  const round = await liveRound(album, roundId, 'bingo');
  const tile = Number(body.tile);
  if (!Number.isInteger(tile) || tile < 0 || tile >= round.settings.size ** 2) throw new HttpError(400, 'Choose a tile on the card.', 'GAME_INVALID');
  if (!mongoose.isValidObjectId(body.photo)) throw new HttpError(400, 'Choose one of your photos.', 'GAME_INVALID');
  const photo = await Photo.findOne({ _id: body.photo, album: album._id, ...SHOWN }, 'uploader').lean();
  if (!photo) throw new HttpError(404, 'That photo isn’t in this event.', 'GAME_PHOTO_NOT_FOUND');
  if (!photo.uploader?.equals(user._id)) throw new HttpError(403, 'You can use the photos you added.', 'GAME_PHOTO_NOT_YOURS');
  const used = await GameResponse.findOne({ round: round._id, user: user._id, photo: photo._id }, 'q').lean();
  if (used && used.q !== tile) throw new HttpError(409, 'That photo already claims another tile.', 'GAME_PHOTO_USED');
  try {
    await GameResponse.updateOne({ round: round._id, user: user._id, q: tile },
      { $set: { photo: photo._id, choice: 0, points: TILE_POINTS }, $setOnInsert: { album: album._id } }, { upsert: true });
  } catch (error) {
    // Two claims at the same moment: the database lets one photo hold one tile only
    if (error.code === 11000) throw new HttpError(409, 'That photo already claims another tile.', 'GAME_PHOTO_USED');
    throw error;
  }
  forget(album._id);
  return { tile, photo: String(photo._id) };
}
// Take a claim back (yours), or, for the host, remove anyone's claim (an off-topic photo)
export async function unclaimTile(album, user, roundId, tile, { host = false, of } = {}) {
  const round = await liveRound(album, roundId, 'bingo');
  const who = host && of ? of : user._id;
  if (host && of && !mongoose.isValidObjectId(of)) throw new HttpError(404, 'That claim isn’t on the card.', 'GAME_NOT_FOUND');
  const gone = await GameResponse.deleteOne({ round: round._id, user: who, q: Number(tile) });
  if (!gone.deletedCount) throw new HttpError(404, 'That claim isn’t on the card.', 'GAME_NOT_FOUND');
  forget(album._id);
  return { ok: true };
}

// ---- The state pages ask for (built at most every STATE_MS per album) ----
const states = new Map();
function forget(albumId) { states.delete(String(albumId)); }
export const forgetGames = forget;
export function _clearCache() { states.clear(); }
async function stateOf(albumId) {
  const key = String(albumId), hit = states.get(key);
  if (hit && Date.now() - hit.at < STATE_MS) return hit.promise;
  const promise = build(albumId);
  states.set(key, { at: Date.now(), promise });
  promise.catch(() => states.delete(key));
  if (states.size > 2000) states.delete(states.keys().next().value);
  return promise;
}
async function build(albumId) {
  // A timed game whose time is up ends now, before anyone sees it still live
  if (await GameRound.exists({ album: albumId, status: 'live', endsAt: { $lte: new Date() } })) await endDueRounds({ album: albumId });
  const [rounds, responses, awards, entries, votes] = await Promise.all([
    GameRound.find({ album: albumId }).sort({ createdAt: -1 }).lean(),
    GameResponse.find({ album: albumId }, 'round user q choice points correct photo').lean(),
    GameAward.find({ album: albumId }, 'round user points place').lean(),
    GameEntry.find({ album: albumId }).lean(),
    GameVote.find({ album: albumId }, 'round user winner loser at').lean(),
  ]);
  const contestEntries = await contest.entriesFor(albumId);
  // Battles: entries whose photos are still shown, rated from their votes
  // Photos still shown in the album (battle entries and bingo claims with a binned or hidden photo don't count)
  const photoIds = [...entries.map((e) => e.photo), ...responses.filter((r) => r.photo).map((r) => r.photo)];
  const shown = new Set((await Photo.find({ _id: { $in: photoIds }, ...SHOWN }, '_id').lean()).map((p) => String(p._id)));
  const battles = new Map();
  for (const r of rounds.filter((x) => x.type === 'battle')) {
    const these = entries.filter((e) => String(e.round) === String(r._id) && shown.has(String(e.photo)));
    const rv = votes.filter((v) => String(v.round) === String(r._id));
    battles.set(String(r._id), { standings: rate(these, rv), votesBy: rv.reduce((m, v) => m.set(String(v.user), (m.get(String(v.user)) || 0) + 1), new Map()) });
  }
  const placesOf = new Map();
  for (const a of awards) placesOf.set(`${a.round}:${a.user}`, a.place);
  const byRound = new Map();
  const totals = new Map();
  for (const r of responses) {
    if (r.photo && !shown.has(String(r.photo))) continue;
    const k = String(r.round);
    if (!byRound.has(k)) byRound.set(k, []);
    byRound.get(k).push(r);
    totals.set(String(r.user), (totals.get(String(r.user)) || 0) + (r.points || 0));
  }
  for (const a of awards) totals.set(String(a.user), (totals.get(String(a.user)) || 0) + a.points);
  // Bingo: line and full-card points, worked out from each person's claimed tiles
  for (const r of rounds.filter((x) => x.type === 'bingo')) {
    const per = new Map();
    for (const c of byRound.get(String(r._id)) || []) {
      if (!per.has(String(c.user))) per.set(String(c.user), []);
      per.get(String(c.user)).push(c.q);
    }
    for (const [u, tiles] of per) {
      const s2 = bingoScore(r.settings.size, tiles);
      totals.set(u, (totals.get(u) || 0) + s2.points - s2.tiles * TILE_POINTS);
    }
  }
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const bingoPlayers = rounds.filter((x) => x.type === 'bingo').flatMap((r) => (byRound.get(String(r._id)) || []).map((c) => String(c.user)));
  const wanted = new Set([...top.map(([u]) => u), ...[...battles.values()].flatMap((b) => b.standings.map((e) => e.user)), ...bingoPlayers,
    ...contestEntries.map((e) => String(e.user))]);
  const names = new Map((await User.find({ _id: { $in: [...wanted] } }, 'name').lean()).map((u) => [String(u._id), (u.name || '').trim().split(/\s+/)[0] || 'Guest']));
  // Game wins: how many finished games each person came 1st in (ties count for everyone tied)
  const wins = new Map(), winNames = new Map();
  for (const r of rounds) {
    if (r.status !== 'ended') continue;
    for (const p of (r.podium || []).filter((x) => x.place === 1)) {
      const u = String(p.user);
      wins.set(u, (wins.get(u) || 0) + 1);
      winNames.set(u, names.get(u) || p.name || 'Guest');
    }
  }
  const winsBoard = [...wins.entries()].sort((a, b) => (b[1] - a[1]) || ((totals.get(b[0]) || 0) - (totals.get(a[0]) || 0))).slice(0, 10)
    .map(([u, n]) => ({ user: u, name: winNames.get(u), wins: n, points: totals.get(u) || 0 }));
  winsBoard.forEach((row, i) => { row.rank = 1 + winsBoard.filter((x) => x.wins > row.wins).length; });
  return { rounds, byRound, totals, wins, winsBoard, battles, placesOf, names, contestEntries, board: top.map(([u, points], i) => ({ rank: i + 1, user: u, name: names.get(u) || 'Guest', points })) };
}

// One round as a player (or the host) sees it
function view(round, responses = [], userId, host, s = {}) {
  const me = String(userId);
  const st = round.settings || {};
  const base = { id: String(round._id), type: round.type, title: round.title, status: round.status, startedAt: round.startedAt || null, endedAt: round.endedAt || null,
    // A time limit: when it ends by itself (live), or how long it will run once started (draft)
    endsAt: round.endsAt || null, minutes: st.minutes || null, untilEventEnds: !!st.untilEventEnds,
    // Once finished: the top 3 places (ties share), and whether you won
    ...(round.status === 'ended' && round.podium && {
      results: round.podium.map((p) => ({ name: String(p.user) === me ? 'You' : (s.names?.get(String(p.user)) || p.name || 'Guest'), points: p.points, place: p.place, mine: String(p.user) === me })),
      iWon: round.podium.some((p) => p.place === 1 && String(p.user) === me),
    }) };
  if (round.type === 'contest') {
    return { ...base, ...contest.contestView(round, (s.contestEntries || []).filter((e) => String(e.round) === String(round._id)), userId, host, s.names) };
  }
  if (round.type === 'bingo') {
    const { size, prompts } = round.settings;
    const mineByTile = new Map(), counts = prompts.map(() => 0), per = new Map();
    for (const c of responses) {
      if (counts[c.q] !== undefined) counts[c.q]++;
      if (String(c.user) === me) mineByTile.set(c.q, c);
      if (!per.has(String(c.user))) per.set(String(c.user), []);
      per.get(String(c.user)).push(c.q);
    }
    const mine = bingoScore(size, [...mineByTile.keys()]);
    const leaders = [...per.entries()].map(([u, tiles]) => ({ u, ...bingoScore(size, tiles) }))
      .sort((a, b) => (b.points - a.points)).slice(0, 5)
      .map((x, i) => ({ rank: i + 1, name: x.u === me ? 'You' : (s.names?.get(x.u) || 'Guest'), mine: x.u === me, tiles: x.tiles, lines: x.lines, full: x.full, points: x.points }));
    return { ...base, size, tiles: prompts.map((prompt, i) => ({ index: i, prompt, claims: counts[i],
      mine: mineByTile.has(i) ? { photo: String(mineByTile.get(i).photo), ...photoLinks(mineByTile.get(i).photo) } : null })),
    myTiles: mine.tiles, myLines: mine.lines, fullCard: mine.full, myScore: mine.points, leaders,
    ...(host && { claims: responses.map((c) => ({ tile: c.q, user: String(c.user), name: s.names?.get(String(c.user)) || 'Guest', photo: String(c.photo), ...photoLinks(c.photo) })) }) };
  }
  if (round.type === 'battle') {
    const b = s.battles?.get(String(round._id)) || { standings: [], votesBy: new Map() };
    const standings = b.standings.map((e) => ({ rank: e.rank, photo: String(e.photo), ...photoLinks(e.photo), by: e.user === me ? 'You' : (s.names?.get(e.user) || 'Guest'),
      mine: e.user === me, wins: e.wins, losses: e.losses, rating: e.rating, ...(round.status === 'ended' && { place: s.placesOf?.get(`${round._id}:${e.user}`) || null }) }));
    const myEntries = standings.filter((e) => e.mine).map((e) => e.photo);
    return { ...base, maxEntries: round.settings.maxEntries, entries: standings.length, standings, myEntries,
      myVotes: b.votesBy.get(me) || 0, canEnter: round.status === 'live' && myEntries.length < round.settings.maxEntries,
      canVote: round.status === 'live' && standings.filter((e) => !e.mine).length >= 2 };
  }
  if (round.type === 'poll') {
    const counts = round.settings.options.map(() => 0);
    let mine = null;
    for (const r of responses) { if (counts[r.choice] !== undefined) counts[r.choice]++; if (String(r.user) === me) mine = r.choice; }
    const total = counts.reduce((a, b) => a + b, 0);
    return { ...base, question: round.settings.question, total, myChoice: mine,
      options: round.settings.options.map((o, i) => ({ id: o.id, text: o.text, votes: counts[i], percent: total ? Math.round((counts[i] / total) * 100) : 0 })) };
  }
  // trivia and mystery crop
  const crop = round.type === 'crop';
  const { questions, current, currentAt } = round.settings;
  const now = Date.now();
  const q = current >= 0 ? questions[current] : null;
  const endsAt = q ? new Date(new Date(currentAt).getTime() + q.seconds * 1000) : null;
  const revealed = round.status === 'ended' || (q && endsAt.getTime() <= now);
  const mineNow = q && responses.find((r) => String(r.user) === me && r.q === current);
  const roundScores = new Map();
  for (const r of responses) roundScores.set(String(r.user), (roundScores.get(String(r.user)) || 0) + (r.points || 0));
  return { ...base, questionCount: questions.length, current: round.status === 'live' ? current : null,
    question: round.status === 'live' && q ? { index: current, text: q.text, options: q.options, seconds: q.seconds, endsAt,
      ...(revealed && { answer: q.answer }), answers: responses.filter((r) => r.q === current).length,
      // Mystery crop: the picture (at its current zoom) and when it next zooms out
      ...(crop && (() => {
        const stage = cropStage(q, currentAt, now), part = (q.seconds * 1000) / CROP_STAGES.length;
        return { stage, stages: CROP_STAGES.length, points: CROP_POINTS[stage],
          image: `${config.publicUrl}/api/albums/${round.album}/games/${round._id}/image?q=${current}&stage=${stage}`,
          nextStageAt: stage < CROP_STAGES.length - 1 ? new Date(new Date(currentAt).getTime() + (stage + 1) * part) : null,
          ...(revealed && { photo: String(q.photo), ...photoLinks(q.photo) }) };
      })()) } : null,
    myAnswer: mineNow ? { option: mineNow.choice, correct: revealed ? mineNow.correct : undefined, points: revealed ? mineNow.points : undefined } : null,
    myScore: roundScores.get(me) || 0,
    ...(host && { questions: crop ? questions.map((x) => ({ ...x, photo: String(x.photo) })) : questions }) };
}

export async function albumGames(albumId, userId, host) {
  const s = await stateOf(albumId);
  return {
    rounds: s.rounds.map((r) => view(r, s.byRound.get(String(r._id)), userId, host, s)),
    leaderboard: s.board.map(({ user, ...row }) => ({ ...row, mine: user === String(userId) })),
    myPoints: s.totals.get(String(userId)) || 0,
    // Who has won the most games at this event
    winsBoard: s.winsBoard.map(({ user, ...row }) => ({ ...row, mine: user === String(userId) })),
    myWins: s.wins.get(String(userId)) || 0,
  };
}
export async function oneGame(albumId, roundId, userId, host) {
  const s = await stateOf(albumId);
  const r = s.rounds.find((x) => String(x._id) === String(roundId));
  if (!r) throw new HttpError(404, 'Game not found.', 'GAME_NOT_FOUND');
  return view(r, s.byRound.get(String(r._id)), userId, host, s);
}

// ---- Clean-up: with their album, or with a person's account ----
export async function removeGamesFor({ albums = [], user } = {}) {
  if (albums.length) {
    await Promise.all([GameRound.deleteMany({ album: { $in: albums } }), GameResponse.deleteMany({ album: { $in: albums } }), GameAward.deleteMany({ album: { $in: albums } }),
      GameEntry.deleteMany({ album: { $in: albums } }), GameVote.deleteMany({ album: { $in: albums } }), contest.removeContestEntries({ album: { $in: albums } })]);
    albums.forEach(forget);
  }
  if (user) await Promise.all([GameResponse.deleteMany({ user }), GameAward.deleteMany({ user }), GameEntry.deleteMany({ user }), GameVote.deleteMany({ user }),
    contest.removeContestEntries({ user })]);
}
