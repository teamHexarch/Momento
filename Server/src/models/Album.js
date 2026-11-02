import mongoose from 'mongoose';

const albumSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  // The day of the event, as YYYY-MM-DD (the client shows it without a time zone)
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  place: { type: String, trim: true, maxlength: 120, default: '' },
  // Join code, stored without the dash: K7Q48DM is shown as K7Q-48DM
  code: { type: String, required: true, unique: true },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Sharing zone. Stored now, not enforced on join yet.
  zone: {
    lat: Number,
    lng: Number,
    radiusM: { type: Number, min: 10, max: 5000 },
  },
  // When a host last emailed guests who haven't added photos (one reminder a day per album)
  lastReminderAt: Date,
  // Where photos are kept. Only 'momento' (this server's disk) exists so far.
  destination: { type: String, enum: ['momento', 'google-drive', 'dropbox', 'onedrive'], default: 'momento' },
}, { timestamps: true });

albumSchema.virtual('displayCode').get(function () {
  return `${this.code.slice(0, 3)}-${this.code.slice(3)}`;
});

export const Album = mongoose.model('Album', albumSchema);
