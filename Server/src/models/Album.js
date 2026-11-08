import mongoose from 'mongoose';

const albumSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  // The day of the event, as YYYY-MM-DD (the client shows it without a time zone)
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  place: { type: String, trim: true, maxlength: 120, default: '' },
  // The venue picked on the map (a Google Maps place), shown with the album
  venue: {
    placeId: { type: String, maxlength: 300 },
    address: { type: String, trim: true, maxlength: 300 },
  },
  // When the event runs (absolute times; the host's browser turns their local times into these).
  // Albums made before event times existed have neither and keep the day-based rules.
  startsAt: Date,
  endsAt: Date,
  // Guests can add photos from this many minutes before startsAt until endsAt
  uploadLeadMin: { type: Number, min: 0, max: 1440, default: 0 },
  // Join code, stored without the dash: K7Q48DM is shown as K7Q-48DM
  code: { type: String, required: true, unique: true },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Sharing zone: guests must be within radiusM of the venue to add photos (1 to 10 km for new
  // albums). Checked on upload; joining is still open to anyone with the code.
  zone: {
    lat: Number,
    lng: Number,
    radiusM: { type: Number, min: 10, max: 10000 },
  },
  // Who can join: 'invite' (the code, link or QR code) or 'public' (also listed on the Events map,
  // where anyone inside the zone can join)
  visibility: { type: String, enum: ['invite', 'public'], default: 'invite' },
  // When a host last emailed guests who haven't added photos (one reminder a day per album)
  lastReminderAt: Date,
  // Where photos are kept. Only 'momento' (this server's disk) exists so far.
  destination: { type: String, enum: ['momento', 'google-drive', 'dropbox', 'onedrive'], default: 'momento' },
}, { timestamps: true });

// The Events map looks public albums up by where their zone is
albumSchema.index({ visibility: 1, 'zone.lat': 1, 'zone.lng': 1 });

albumSchema.virtual('displayCode').get(function () {
  return `${this.code.slice(0, 3)}-${this.code.slice(3)}`;
});

export const Album = mongoose.model('Album', albumSchema);
