// Event mini-games: polls and trivia (more games are added as their own types). Album members play; the host
// creates, starts, moves on and ends each round. Pages ask for the state every 2-4 seconds; the state of an album's
// games is built at most once every 2 seconds (STATE_MS) whoever asks, so 100+ guests polling cost one set of
// database reads per album every 2 seconds. Scoring:
//   poll:   10 points for taking part (a vote can be changed while the poll is open)
//   trivia: 100 points for a right answer, plus up to 50 for answering quickly; one answer per question
//   battle: 2 points per vote (the first 10 votes in a battle); when it ends, the people whose photos came 1st, 2nd and
//           3rd get 100, 60 and 30 (PODIUM). Photos are ranked by an Elo rating from the head-to-head votes.
// The leaderboard adds up every response's points and the host's awards (podium places) in the album.
import mongoose from 'mongoose';
import { GameRound, GameResponse, GameAward, GameEntry, GameVote, GAME_TYPES } from '../models/Game.js';
import { User } from '../models/User.js';
import { Photo } from '../models/Photo.js';
import { config } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { cleanText, LIMITS } from '../utils/text.js';

export const STATE_MS = 2000;
export const POLL_POINTS = 10, RIGHT_POINTS = 100, SPEED_POINTS = 50;
export const VOTE_POINTS = 2, POINTED_VOTES = 10, PODIUM = [100, 60, 30];
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
const READERS = { poll: readPoll, trivia: readTrivia, battle: readBattle };

export async function createRound(album, user, body = {}) {
  const type = body.type;
  if (!GAME_TYPES.includes(type)) throw new HttpError(400, `Choose a game: ${GAME_TYPES.join(', ')}.`, 'GAME_INVALID');
  if (await GameRound.countDocuments({ album: album._id }) >= MAX_ROUNDS_PER_ALBUM) throw new HttpError(409, 'This album has a lot of games already. Delete some first.', 'GAME_LIMIT');
  const title = cleanText(body.title, { max: LIMITS.title, what: 'The name', required: true });
  const round = await GameRound.create({ album: album._id, type, title, createdBy: user._id, settings: READERS[type](body) });
  forget(album._id);
  if (body.start === true) return startRound(album, round._id);
  return round;
}

// ---- The host runs a round ----
async function hostRound(album, roundId) {
  if (!mongoose.isValidObjectId(roundId)) throw new HttpError(404, 'Game not found.', 'GAME_NOT_FOUND');
  const round = await GameRound.findOne({ _id: roundId, album: album._id });
  if (!round) throw new HttpError(404, 'Game not found.', 'GAME_NOT_FOUND');
  return round;
}
export async function startRound(album, roundId) {
  const round = await hostRound(album, roundId);
  if (round.status !== 'draft') throw new HttpError(409, 'This game has already started.', 'GAME_STATE');
  const set = { status: 'live', startedAt: new Date() };
  if (round.type === 'trivia') Object.assign(set, { 'settings.current': 0, 'settings.currentAt': new Date() });
  await GameRound.updateOne({ _id: round._id, status: 'draft' }, { $set: set });
  forget(album._id);
  return GameRound.findById(round._id);
}
// Trivia: on to the next question (the last one ends the round)
export async function nextQuestion(album, roundId) {
  const round = await hostRound(album, roundId);
  if (round.type !== 'trivia' || round.status !== 'live') throw new HttpError(409, 'Only a live trivia round has a next question.', 'GAME_STATE');
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
  forget(album._id);
  return GameRound.findById(round._id);
}
export async function removeRound(album, roundId) {
  const round = await hostRound(album, roundId);
  await Promise.all([GameResponse.deleteMany({ round: round._id }), GameAward.deleteMany({ round: round._id }),
    GameEntry.deleteMany({ round: round._id }), GameVote.deleteMany({ round: round._id }), GameRound.deleteOne({ _id: round._id })]);
  forget(album._id);
}

// ---- Playing ----
async function liveRound(album, roundId, type) {
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
// Trivia: an answer to the question on screen, within its time; one per question
export async function answer(album, user, roundId, body = {}) {
  const round = await liveRound(album, roundId, 'trivia');
  const { questions, current, currentAt } = round.settings;
  const q = Number(body.question);
  if (q !== current) throw new HttpError(409, 'That question isn’t being asked now.', 'GAME_STATE');
  const question = questions[q];
  const choice = Number(body.option);
  if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) throw new HttpError(400, 'Choose one of the answers.', 'GAME_INVALID');
  const left = new Date(currentAt).getTime() + question.seconds * 1000 - Date.now();
  if (left <= 0) throw new HttpError(409, 'Time’s up for this question.', 'GAME_TIME_UP');
  const correct = choice === question.answer;
  const points = correct ? RIGHT_POINTS + Math.round(SPEED_POINTS * Math.min(1, left / (question.seconds * 1000))) : 0;
  try {
    await GameResponse.create({ round: round._id, album: album._id, user: user._id, q, choice, correct, points });
  } catch (error) {
    if (error.code === 11000) throw new HttpError(409, 'You’ve already answered this question.', 'GAME_ANSWERED');
    throw error;
  }
  return { question: q, choice, correct, points };
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

// ---- The state pages ask for (built at most every STATE_MS per album) ----
const states = new Map();
function forget(albumId) { states.delete(String(albumId)); }
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
  const [rounds, responses, awards, entries, votes] = await Promise.all([
    GameRound.find({ album: albumId }).sort({ createdAt: -1 }).lean(),
    GameResponse.find({ album: albumId }, 'round user q choice points correct').lean(),
    GameAward.find({ album: albumId }, 'round user points place').lean(),
    GameEntry.find({ album: albumId }).lean(),
    GameVote.find({ album: albumId }, 'round user winner loser at').lean(),
  ]);
  // Battles: entries whose photos are still shown, rated from their votes
  const shown = new Set((await Photo.find({ _id: { $in: entries.map((e) => e.photo) }, ...SHOWN }, '_id').lean()).map((p) => String(p._id)));
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
    const k = String(r.round);
    if (!byRound.has(k)) byRound.set(k, []);
    byRound.get(k).push(r);
    totals.set(String(r.user), (totals.get(String(r.user)) || 0) + (r.points || 0));
  }
  for (const a of awards) totals.set(String(a.user), (totals.get(String(a.user)) || 0) + a.points);
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const wanted = new Set([...top.map(([u]) => u), ...[...battles.values()].flatMap((b) => b.standings.map((e) => e.user))]);
  const names = new Map((await User.find({ _id: { $in: [...wanted] } }, 'name').lean()).map((u) => [String(u._id), (u.name || '').trim().split(/\s+/)[0] || 'Guest']));
  return { rounds, byRound, totals, battles, placesOf, names, board: top.map(([u, points], i) => ({ rank: i + 1, user: u, name: names.get(u) || 'Guest', points })) };
}

// One round as a player (or the host) sees it
function view(round, responses = [], userId, host, s = {}) {
  const me = String(userId);
  const base = { id: String(round._id), type: round.type, title: round.title, status: round.status, startedAt: round.startedAt || null, endedAt: round.endedAt || null };
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
  // trivia
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
      ...(revealed && { answer: q.answer }), answers: responses.filter((r) => r.q === current).length } : null,
    myAnswer: mineNow ? { option: mineNow.choice, correct: revealed ? mineNow.correct : undefined, points: revealed ? mineNow.points : undefined } : null,
    myScore: roundScores.get(me) || 0,
    ...(host && { questions }) };
}

export async function albumGames(albumId, userId, host) {
  const s = await stateOf(albumId);
  return {
    rounds: s.rounds.map((r) => view(r, s.byRound.get(String(r._id)), userId, host, s)),
    leaderboard: s.board.map(({ user, ...row }) => ({ ...row, mine: user === String(userId) })),
    myPoints: s.totals.get(String(userId)) || 0,
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
      GameEntry.deleteMany({ album: { $in: albums } }), GameVote.deleteMany({ album: { $in: albums } })]);
    albums.forEach(forget);
  }
  if (user) await Promise.all([GameResponse.deleteMany({ user }), GameAward.deleteMany({ user }), GameEntry.deleteMany({ user }), GameVote.deleteMany({ user })]);
}
