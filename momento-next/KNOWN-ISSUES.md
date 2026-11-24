# Momento: what still needs fixing (24 November 2026)

Ordered by impact. Each item says who it's for, what people see, and what needs to happen. "Front end" means the
website (`Client/`), and "backend" means the server (`Server/`).

## 1. Breaks something on the live site

**Reviews page doesn't work yet** (backend)
- The server has no reviews feature yet. On hexarch.org/reviews the score shows "The score didn't load" and nobody can
  post a review.
- The page is finished and works with sample data. It needs the server routes described in
  `BACKEND-NOTES-NEXT.md` (list, post, delete; one review per person).
- Until then, the Reviews links in the home page's menu and the footer lead to a page that doesn't work. They could be
  hidden until the routes exist.

## 2. Needs checking on a real phone and with real accounts

Everything below was tested only in a desktop browser pretending to be a phone, with a fake camera and sample data.

- **Camera on iPhone (Safari) and Android:**
  - back camera zoom, including the 0.5× wide lens, plus flash and brightness
  - the front camera's mirror image
  - that saved photos match the zoom you saw
  - pinch to zoom, and that the page itself never zooms
  - the liquid glass look over a real picture
- **Swiping in the photo viewer on a real phone:** it should never get stuck, including fast swipes and swipes that
  end on the photo strip.
- **Uploading HEIC, HEIF and DNG (ProRAW)** from an iPhone and from a Windows PC.
- **Everything that needs the real server:**
  - sign up, log in, Google sign-in
  - password reset and email links
  - new-device approval
  - uploads and the photo checks list (including Request review)
  - QR scanning
  - the staff Photo review page
- **The joint audit:** `../AUDIT-CHECKLIST.md` lists every part of the move to Next.js that hasn't had a full
  old-versus-new check yet. The camera entry in it describes the earlier version, with a slider. See section 4.

## 3. Missing or incomplete

- **Translations:** the new text isn't translated into the site's other languages yet, so it shows in English:
  - the Reviews page
  - sort, filters and Added by
  - the viewer's zoom buttons
  - the camera's button labels
  - the new upload format lists
- **Sort by file name and Largest first:** these only appear once the server sends each photo's file name and size
  (backend, optional fields, see `BACKEND-NOTES-NEXT.md`). Until then the sort menu leaves them out.
- **Requested features not built** (they need the backend first):
  - sorting on the server
  - mini-games
  - hiding the group name from people who only joined the album

## 4. Small or cosmetic

- **Social:** leaving the page within about a second of opening it can log a "Style is not done loading" error from
  the map in the browser console. Nobody sees it. It existed before this release.
- **Camera:** on a very narrow phone, the timer's label (shown to the left of the tools column) sits close to the
  middle of the picture. It hasn't been checked on a small phone.
- **Audit checklist:** the camera entry in `../AUDIT-CHECKLIST.md` still describes the slider version. Update it
  before the audit.

## 5. Technical debt (not visible to users, slows down future work)

- **Languages:** the language switcher (`assets/i18n.js`) still rewrites the page's text after it loads. It can't
  become part of React until the pages draw their own text.
- **Page changes:** moving between pages reloads the whole page. Smooth in-app navigation needs each page's code to
  clean up after itself first.
- **Page code:** Home, My albums, Social and Settings still run their original code. It was moved into React, not
  rewritten.
- **Older scripts:** about 430 KB of shared scripts in `public/assets/` are still loaded as separate files. These are
  the camera, QR codes, the inbox, pickers, nearby events, album settings, joining and event albums.
- **Two copies of the code:** the local `momento-next/` folder and the repo's `Client/` folder have to be kept the
  same by hand. Working directly in a clone of the repo would remove that step.
