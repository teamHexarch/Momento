import mongoose from 'mongoose';
import { LIMITS } from '../utils/text.js';

// Event mini-games (services/gameService.js, routes under /api/albums/:id/games). One GameRound per game the host
// runs in an album (a poll, a trivia round, ...); one GameResponse per person per question/vote; GameAward for points
// given by the host (podium places). The leaderboard adds up the points of an album's responses and awards.
export const GAME_TYPES = ['poll', 'trivia', 'battle', 'bingo'];

const roundSchema = new mongoose.Schema({
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  type: { type: String, enum: GAME_TYPES, required: true },
  title: { type: String, required: true, maxlength: LIMITS.title },
  status: { type: String, enum: ['draft', 'live', 'ended'], default: 'draft' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startedAt: Date,
  endedAt: Date,
  // poll: { question, options: [{ id, text }] }
  // trivia: { questions: [{ text, options: [String], answer: Number, seconds }], current: Number, currentAt: Date }
  // battle: { maxEntries: Number (photos per person) }
  // bingo: { size: 3 | 4, prompts: [String] (size x size, row by row) }
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { collection: 'game_rounds', timestamps: true, versionKey: false });
roundSchema.index({ album: 1, createdAt: -1 });

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

export const GameRound = mongoose.model('GameRound', roundSchema);
export const GameEntry = mongoose.model('GameEntry', entrySchema);
export const GameVote = mongoose.model('GameVote', voteSchema);
export const GameResponse = mongoose.model('GameResponse', responseSchema);
export const GameAward = mongoose.model('GameAward', awardSchema);
