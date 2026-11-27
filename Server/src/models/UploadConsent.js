import mongoose from 'mongoose';

// The upload agreement: someone ticked "I took these photos or have permission to share them..." before uploading
// to an album, against a version of the Terms. One row per person per album (agreeing again under newer Terms
// replaces it). Kept apart from Membership because friend-group members have no saved membership row.
// Deleted with the album and with the account (and by the nightly orphans job if either is already gone).
const uploadConsentSchema = new mongoose.Schema({
  album: { type: mongoose.Schema.Types.ObjectId, ref: 'Album', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  termsVersion: { type: String, required: true, maxlength: 40 },
  at: { type: Date, required: true },
}, { versionKey: false });

uploadConsentSchema.index({ album: 1, user: 1 }, { unique: true });
uploadConsentSchema.index({ user: 1 });

export const UploadConsent = mongoose.model('UploadConsent', uploadConsentSchema);
