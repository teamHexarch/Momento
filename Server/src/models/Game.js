import mongoose from 'mongoose';
import { LIMITS } from '../utils/text.js';

// Event mini-games (services/gameService.js, routes under /api/albums/:id/games). One GameRound per game the host
// runs in an album (a poll, a trivia round, ...); one GameResponse per person per question/vote; GameAward for points
// given by the host (podium places). The leaderboard adds up the points of an album's responses and awards.
export const GAME_TYPES = ['poll', 'trivia', 'battle', 'bingo', 'crop', 'contest'];

const roundSchema = new mongoose.Schema({
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  type: { type: String, enum: GAME_TYPES, required: true },
  title: { type: String, required: true, maxlength: LIMITS.title },
  status: { type: String, enum: ['draft', 'live', 'ended'], default: 'draft' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startedAt: Date,
  endedAt: Date,
  // A time limit (polls, photo battles, bingo): the game ends by itself at endsAt (set when it starts, from
  // settings.minutes, or the event's end for settings.untilEventEnds). Ended by gameService.endDueRounds.
  endsAt: Date,
  // Set when it ends: the top 3 places (ties share a place), each with that person's points in this game.
  // Everyone in 1st place is a winner: they get a "You won" notification and a game win on the event's board.
  podium: { type: [{ _id: false, user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: String, points: Number, place: Number }], default: undefined },
  // poll: { question, options: [{ id, text }] }
  // trivia: { questions: [{ text, options: [String], answer: Number, seconds }], current: Number, currentAt: Date }
  // battle: { maxEntries: Number (photos per person) }
  // bingo: { size: 3 | 4, prompts: [String] (size x size, row by row) }
  // crop: like trivia, each question also has { photo, focus: { x, y } } (the detail the close-up starts on)
  // contest: { maxEntries, phase: 'entries' | 'judging', finalists: [{ entry, score, reason }], podium: [entryId], ai }
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { collection: 'game_rounds', timestamps: true, versionKey: false });
roundSchema.index({ album: 1, createdAt: -1 });
// Timed games whose time is up (gameService.endDueRounds, every few seconds)
roundSchema.index({ status: 1, endsAt: 1 }, { partialFilterExpression: { endsAt: { $exists: true } } });

const responseSchema = new mongoose.Schema({
  round: { type: mongoose.Schema.Types.ObjectId, ref: 'GameRound', required: true },
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Which question (trivia) or 0 (a poll vote)
  q: { type: Number, default: 0 },
  choice: { type: Number, required: true },
  // Bingo: the photo that claims tile q
  photo: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo' },
  correct: Boolean,
  points: { type: Number, default: 0 },
}, { collection: 'game_responses', timestamps: { createdAt: 'at', updatedAt: false }, versionKey: false });
responseSchema.index({ round: 1, user: 1, q: 1 }, { unique: true });
responseSchema.index({ album: 1, user: 1 });
responseSchema.index({ photo: 1 }, { partialFilterExpression: { photo: { $exists: true } } });
// Bingo: a photo claims one tile per person per card (enforced by the database, even for claims sent at the same moment)
responseSchema.index({ round: 1, user: 1, photo: 1 }, { unique: true, partialFilterExpression: { photo: { $exists: true } } });

const awardSchema = new mongoose.Schema({
  round: { type: mongoose.Schema.Types.ObjectId, ref: 'GameRound', required: true },
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  place: Number,
  points: { type: Number, required: true },
}, { collection: 'game_awards', timestamps: { createdAt: 'at', updatedAt: false }, versionKey: false });
awardSchema.index({ round: 1, user: 1 }, { unique: true });
awardSchema.index({ album: 1 });

// Photo battle: the photos entered (each a published photo of the album, entered by the person who added it) and
// the head-to-head votes ("which is better?"), one per person per pair
const entrySchema = new mongoose.Schema({
  round: { type: mongoose.Schema.Types.ObjectId, ref: 'GameRound', required: true },
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  photo: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo', required: true },
}, { collection: 'game_entries', timestamps: { createdAt: 'at', updatedAt: false }, versionKey: false });
entrySchema.index({ round: 1, photo: 1 }, { unique: true });
entrySchema.index({ round: 1, user: 1 });
entrySchema.index({ photo: 1 });
entrySchema.index({ album: 1 });
const voteSchema = new mongoose.Schema({
  round: { type: mongoose.Schema.Types.ObjectId, ref: 'GameRound', required: true },
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  winner: { type: mongoose.Schema.Types.ObjectId, required: true },
  loser: { type: mongoose.Schema.Types.ObjectId, required: true },
  pair: { type: String, required: true },   // the two photo ids, sorted: one vote per person per pair
}, { collection: 'game_votes', timestamps: { createdAt: 'at', updatedAt: false }, versionKey: false });
voteSchema.index({ round: 1, user: 1, pair: 1 }, { unique: true });
voteSchema.index({ album: 1 });
voteSchema.index({ winner: 1 });
voteSchema.index({ loser: 1 });

// Photo competitions (services/contestService.js): a photo entered for the competition (not an album photo), stored
// under temp-minigames/ while it runs and minigames-top10/ if it's kept (the top 10); the rest are deleted at the end
const contestEntrySchema = new mongoose.Schema({
  round: { type: mongoose.Schema.Types.ObjectId, ref: 'GameRound', required: true },
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true },
  thumbKey: String,
  mime: String,
  level: { type: Number, default: 0 },   // the nudity check's level (75+ is never shortlisted; 85+ refused)
  score: Number,
  reason: String,
  kept: { type: Boolean, default: false },
  rank: Number,
}, { collection: 'game_contest_entries', timestamps: true, versionKey: false });
contestEntrySchema.index({ round: 1, user: 1 });
contestEntrySchema.index({ album: 1 });
contestEntrySchema.index({ user: 1 });

export const GameRound = mongoose.model('GameRound', roundSchema);
export const ContestEntry = mongoose.model('ContestEntry', contestEntrySchema);
export const GameEntry = mongoose.model('GameEntry', entrySchema);
export const GameVote = mongoose.model('GameVote', voteSchema);
export const GameResponse = mongoose.model('GameResponse', responseSchema);
export const GameAward = mongoose.model('GameAward', awardSchema);
