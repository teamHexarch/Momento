# Looking before logging in, and the nearby scan (server side)

For the front end team: what the server now allows without an account, and what it answers when a
visitor tries to do something.

## 1. Visitors can look around; doing something asks them to log in

Every page can show its buttons (Join, Add photos, Like, Create album, ...) to people who aren't
logged in. The server answers the action itself with a **401** like this:

```json
{ "error": "Log in or sign up to join this album. It only takes a moment.",
  "code": "login-required", "action": "join" }
```

| action     | when                                                            |
|------------|-----------------------------------------------------------------|
| `join`     | `POST /api/albums/join`, `POST /api/events/:id/join`            |
| `upload`   | `POST /api/albums/:id/photos`                                   |
| `react`    | likes and comments on photos                                    |
| `create`   | `POST /api/albums` (create an album)                            |
| `groups`   | creating or changing friend groups                              |
| `view`     | opening an album's photos or a photo                            |
| `continue` | anything else                                                   |

Suggested page behaviour: on `code: "login-required"`, open the log-in / sign-up popup with `error` as
its subtitle, keep what the person was doing (the code they typed, the photos they picked), and run the
same request again once they're logged in. Sign-up already accepts `joinCode` (the album code): the
person is added to that album as soon as they confirm their email.

### `GET /api/albums/preview/:code`  (no login)

What an album is, from its code (QR code or typed), to show before logging in. Never includes photos,
the venue's exact position or guests' names. Capped at 60 looks per 10 minutes per visitor.

```json
{ "album": {
    "code": "K7Q-48DM", "name": "Maya's 30th", "date": "2026-11-21", "place": "Bondi",
    "venue": { "address": "..." }, "startsAt": "...", "endsAt": "...",
    "status": "live", "live": true, "hostName": "Maya", "hostAvatar": "",
    "photos": 124, "guests": 18, "visibility": "invite", "group": false,
    "joining": { "open": true, "needsLocation": true, "radiusM": 1000, "approval": false } },
  "signedIn": false, "member": false }
```

`joining.needsLocation`: joining checks the person is within `radiusM` of the venue.
`joining.approval`: joining is closed, so they can only ask the host.
Errors: 400 (not a 7-character code), 404 (no album has it).

## 2. The nearby scan  (no login)

`GET /api/events/nearby?lat=<lat>&lng=<lng>&radius=<metres>`

- `radius=1000` scans 1 km. Anything from 100 m to 100 km; the old `km=` still works (default 25 km).
- Lists **public** events that haven't ended, within the radius, plus any event whose sharing zone the
  person is standing in even if its venue is further away. Live events first, then nearest.
- Free: the position comes from the phone through the browser (`navigator.geolocation`), and the
  distances are worked out on our server from MongoDB. No AWS Location or Google lookups are made.
  (The Google Maps key is only for drawing a map, if the page shows one.)
- 120 scans per 10 minutes per account, or per IP address when logged out.

```json
{ "events": [ {
    "id": "...", "name": "Harbour party", "place": "...", "venue": { "address": "..." },
    "startsAt": "...", "endsAt": "...", "status": "live", "live": true,
    "zone": { "lat": -33.85, "lng": 151.21, "radiusM": 1000 },
    "distanceM": 600, "inside": true, "inScan": true,
    "bearing": 2, "direction": "north",
    "photos": 40, "pics": [], "guests": 12, "hostName": "Maya", "joined": false } ],
  "scan": { "lat": -33.8568, "lng": 151.2153, "radiusM": 1000, "count": 1 },
  "signedIn": false }
```

For a radar-style scan view:
- `distanceM` and `bearing` (degrees clockwise from north) place each event around the person.
- `direction` gives a word: `north`, `north-east` … or `here` within 30 m.
- `inScan`: within the scan radius.
- `inside`: within the event's own zone, so they can join right away.
- `scan.count` is how many events are within the radius.

Photos (`pics`) are only included for events the person has joined.

Tested by `npm run test:guest` (scripts/testGuest.js).
