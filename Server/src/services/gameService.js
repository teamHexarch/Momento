// Event mini-games: polls and trivia (more games are added as their own types). Album members play; the host
// creates, starts, moves on and ends each round. Pages ask for the state every 2-4 seconds; the state of an album's
// games is built at most once every 2 seconds (STATE_MS) whoever asks, so 100+ guests polling cost one set of
// database reads per album every 2 seconds. Scoring:
//   poll:   10 points for taking part (a vote can be changed while the poll is open)
//   trivia: 100 points for a right answer, plus up to 50 for answering quickly; one answer per question
// The leaderboard adds up every response's points and the host's awards (podium places) in the album.
import mongoose from 'mongoose';
import { GameRound, GameResponse, GameAward, GAME_TYPES } from '../models/Game.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';
import { cleanText, LIMITS } from '../utils/text.js';

export const STATE_MS = 2000;
export const POLL_POINTS = 10, RIGHT_POINTS = 100, SPEED_POINTS = 50;
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
const READERS = { poll: readPoll, trivia: readTrivia };

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
  await GameRound.updateOne({ _id: round._id }, { $set: { status: 'ended', endedAt: new Date() } });
  forget(album._id);
  return GameRound.findById(round._id);
}
export async function removeRound(album, roundId) {
  const round = await hostRound(album, roundId);
  await Promise.all([GameResponse.deleteMany({ round: round._id }), GameAward.deleteMany({ round: round._id }), GameRound.deleteOne({ _id: round._id })]);
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
  const [rounds, responses, awards] = await Promise.all([
    GameRound.find({ album: albumId }).sort({ createdAt: -1 }).lean(),
    GameResponse.find({ album: albumId }, 'round user q choice points correct').lean(),
    GameAward.find({ album: albumId }, 'round user points place').lean(),
  ]);
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
  const names = new Map((await User.find({ _id: { $in: top.map(([u]) => u) } }, 'name').lean()).map((u) => [String(u._id), (u.name || '').trim().split(/\s+/)[0] || 'Guest']));
  return { rounds, byRound, totals, board: top.map(([u, points], i) => ({ rank: i + 1, user: u, name: names.get(u) || 'Guest', points })) };
}

// One round as a player (or the host) sees it
function view(round, responses = [], userId, host) {
  const me = String(userId);
  const base = { id: String(round._id), type: round.type, title: round.title, status: round.status, startedAt: round.startedAt || null, endedAt: round.endedAt || null };
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
    rounds: s.rounds.map((r) => view(r, s.byRound.get(String(r._id)), userId, host)),
    leaderboard: s.board.map(({ user, ...row }) => ({ ...row, mine: user === String(userId) })),
    myPoints: s.totals.get(String(userId)) || 0,
  };
}
export async function oneGame(albumId, roundId, userId, host) {
  const s = await stateOf(albumId);
  const r = s.rounds.find((x) => String(x._id) === String(roundId));
  if (!r) throw new HttpError(404, 'Game not found.', 'GAME_NOT_FOUND');
  return view(r, s.byRound.get(String(r._id)), userId, host);
}

// ---- Clean-up: with their album, or with a person's account ----
export async function removeGamesFor({ albums = [], user } = {}) {
  if (albums.length) {
    await Promise.all([GameRound.deleteMany({ album: { $in: albums } }), GameResponse.deleteMany({ album: { $in: albums } }), GameAward.deleteMany({ album: { $in: albums } })]);
    albums.forEach(forget);
  }
  if (user) await Promise.all([GameResponse.deleteMany({ user }), GameAward.deleteMany({ user })]);
}
