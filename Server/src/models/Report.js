import mongoose from 'mongoose';

// Someone in an album reporting a photo (nudity, abuse, someone's private information, a copyright
// complaint...). The reporter stops seeing it at once; enough reports from different people hide it
// for everyone until staff decide. Staff close a report by taking the photo down or dismissing it.
const reportSchema = new mongoose.Schema({
  photo: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo', required: true },
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required() { return this.source !== 'model'; } },
  source: { type: String, enum: ['user', 'model'], default: 'user' },
  reason: { type: String, enum: ['nudity', 'abuse', 'privacy', 'copyright', 'other'], required: true },
  note: { type: String, maxlength: 1000, default: '' },
  status: { type: String, enum: ['open', 'removed', 'dismissed'], default: 'open' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  decidedAt: Date,
}, { timestamps: true });

reportSchema.index({ photo: 1, reporter: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: -1 });

export const Report = mongoose.model('Report', reportSchema);
