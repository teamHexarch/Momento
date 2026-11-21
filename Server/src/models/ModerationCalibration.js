import mongoose from 'mongoose';

// The stage-one calibration table the server learns from staff reviews (services/stageOneLearning.js), one
// document ('stage-one'). Rebuilt on start-up and every NSFW_RELEARN_HOURS; a failed rebuild keeps the last table.
const schema = new mongoose.Schema({
  _id: String,
  table: mongoose.Schema.Types.Mixed,
  scoreVersion: Number,   // the stage-one score definition it was built with (uploadChecks.js, SCORE_VERSION)
  builtAt: Date,
  reviewed: Number,       // staff-reviewed uploads used
  publishable: Number,    // of which rated 0-50 (or approved without a level)
  albums: Number,
  fit: Number,
  holdout: Number,
  // Per reason staff ticked when keeping photos private: { touching: { kept, blindSpots }, ... } (reviewCalibration.js)
  reasons: mongoose.Schema.Types.Mixed,
  lastAttemptAt: Date,
  lastError: String,      // why the latest rebuild kept the previous table (e.g. not enough reviews yet)
}, { versionKey: false });

export const ModerationCalibration = mongoose.model('ModerationCalibration', schema);
