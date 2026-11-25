import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { HttpError } from '../utils/httpError.js';
import { membershipOf } from '../controllers/albumController.js';
import * as games from '../services/gameService.js';

// Event mini-games: /api/albums/:id/games (services/gameService.js). Only in events (albums with a time and place;
// a plain photo album has no games). Album members only (404 for anyone else); creating and running games is for the
// album's host. Pages poll GET /api/albums/:id/games every 2-4 seconds.
export const gameRoutes = Router({ mergeParams: true });

// Votes and answers: 60 a minute per person (a stuck button or a script can't flood a game)
const playLimit = rateLimit({
  windowMs: 60000, limit: 60, keyGenerator: (req) => `game:${req.user.id}`, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'That’s a lot of taps. Wait a moment, then try again.', code: 'GAME_RATE_LIMIT' },
});
// An event: kind 'event', or an older album with event times
export const isEvent = (album) => (album.kind || (album.startsAt ? 'event' : 'album')) === 'event';
const member = async (req, { listing = false } = {}) => {
  const m = await membershipOf(req, req.params.id);
  if (!listing && !isEvent(m.album)) throw new HttpError(403, 'Games are only for events.', 'GAMES_EVENTS_ONLY');
  return { album: m.album, host: m.role === 'host' };
};
const hostOnly = async (req) => {
  const m = await member(req);
  if (!m.host) throw new HttpError(403, 'Only the host can run the games.', 'GAME_HOST_ONLY');
  return m.album;
};
const noStore = (res) => res.set('Cache-Control', 'private, no-store');

gameRoutes.get('/', async (req, res) => {
  const { album, host } = await member(req, { listing: true });
  // A plain album: no games (enabled: false tells the page not to show the games section)
  if (!isEvent(album)) return noStore(res).json({ enabled: false, rounds: [], leaderboard: [], myPoints: 0, host, pollEveryMs: 3000 });
  noStore(res).json({ enabled: true, ...(await games.albumGames(album._id, req.user._id, host)), host, pollEveryMs: 3000 });
});
gameRoutes.get('/:round', async (req, res) => {
  const { album, host } = await member(req);
  noStore(res).json({ game: await games.oneGame(album._id, req.params.round, req.user._id, host) });
});
gameRoutes.post('/', async (req, res) => {
  const album = await hostOnly(req);
  const round = await games.createRound(album, req.user, req.body);
  res.status(201).json({ game: await games.oneGame(album._id, round._id, req.user._id, true) });
});
for (const [path, action] of [['start', games.startRound], ['next', games.nextQuestion], ['end', games.endRound]]) {
  gameRoutes.post(`/:round/${path}`, async (req, res) => {
    const album = await hostOnly(req);
    await action(album, req.params.round);
    res.json({ game: await games.oneGame(album._id, req.params.round, req.user._id, true) });
  });
}
gameRoutes.delete('/:round', async (req, res) => {
  const album = await hostOnly(req);
  await games.removeRound(album, req.params.round);
  res.json({ ok: true });
});
gameRoutes.post('/:round/vote', playLimit, async (req, res) => {
  const { album } = await member(req);
  res.json(await games.vote(album, req.user, req.params.round, req.body));
});
gameRoutes.post('/:round/answer', playLimit, async (req, res) => {
  const { album } = await member(req);
  res.json(await games.answer(album, req.user, req.params.round, req.body));
});
// Mystery crop: a guess for the photo on screen, and its picture at the current zoom (never further)
gameRoutes.post('/:round/guess', playLimit, async (req, res) => {
  const { album } = await member(req);
  res.json(await games.answer(album, req.user, req.params.round, req.body, 'crop'));
});
gameRoutes.get('/:round/image', async (req, res) => {
  const { album } = await member(req);
  const { image, stage } = await games.cropImage(album, req.params.round);
  noStore(res).set('X-Crop-Stage', String(stage)).type('image/jpeg').send(image);
});
// Scavenger bingo: claim a tile with your photo, take it back; the host can remove anyone's claim (?user=)
gameRoutes.post('/:round/claims', playLimit, async (req, res) => {
  const { album } = await member(req);
  res.status(201).json(await games.claimTile(album, req.user, req.params.round, req.body));
});
gameRoutes.delete('/:round/claims/:tile', async (req, res) => {
  const { album, host } = await member(req);
  res.json(await games.unclaimTile(album, req.user, req.params.round, req.params.tile, { host, of: host ? req.query.user : undefined }));
});
// Photo battle: enter or withdraw your own photo, get two photos to choose between, pick the better one
gameRoutes.post('/:round/entries', playLimit, async (req, res) => {
  const { album } = await member(req);
  res.status(201).json(await games.enterPhoto(album, req.user, req.params.round, req.body));
});
gameRoutes.delete('/:round/entries/:photo', async (req, res) => {
  const { album } = await member(req);
  res.json(await games.withdrawPhoto(album, req.user, req.params.round, req.params.photo));
});
gameRoutes.get('/:round/pair', async (req, res) => {
  const { album } = await member(req);
  noStore(res).json(await games.nextPair(album, req.user, req.params.round));
});
gameRoutes.post('/:round/pick', playLimit, async (req, res) => {
  const { album } = await member(req);
  res.json(await games.battleVote(album, req.user, req.params.round, req.body));
});
