# Album and event moderation

The API saves each upload in private storage, creates an indexed MongoDB job, and returns HTTP 202. The album shows each uploader their own file statuses. A separate worker removes location metadata, prepares previews, runs the checks and creates a Photo only when it can be published. The website can continue serving albums while models are offline. Upload transfer, hashing, storage writes and status queries still use API resources.

## Worker

Use a dedicated machine with access to the API's MongoDB database and private S3 bucket. For a single-machine development setup using disk storage, give both processes the same absolute UPLOAD_DIR. The Python endpoint accepts image bytes on loopback and processes one inference at a time. The Node worker runs one leased job per stage. Queued work survives restarts. Failed model calls retry before staff review. Avatars and album covers retain their existing moderation path.

The model host needs enough GPU memory or system RAM for Qwen2.5-VL-7B-Instruct and its image inputs. The provided runner uses the published weight precision with automatic device placement. Set FALCONSAI_REVISION and QWEN_REVISION to the model commits used for calibration. Install the Python requirements on the worker and run `python moderation/models.py`, or build the models service from `deploy/moderation-compose.yml`. Download both model revisions on the worker before accepting uploads to avoid cold downloads on the first job.

## Calibration and activation

Prepare two disjoint human-labelled image collections reflecting the actual album mix. Each JSONL row contains an image path relative to the manifest and a severity from 0, 15, 25, 50, 75, 100. Keep pictures from the same event in one split. For this policy 0–25 may publish, 50–75 require review and 100 can be rejected. Check those labels with the moderation team before enabling automatic decisions.

With the model endpoint running, execute this from Server on a worker with its usual environment:

```sh
node --env-file=.env scripts/calibrateModeration.js fit.jsonl holdout.jsonl calibration.json
```

The script checks file hashes for overlap, groups raw scores into bins and evaluates only the cases routed to each stage. It enables a bin only when both datasets support its action at the requested confidence. Empty or unsupported bins escalate or go to staff. Record model revisions alongside the table and recalibrate after a model or policy change. Independently evaluate the finished cascade on fresh events before relying on its performance.

For the AWS worker host, put the resulting file in /opt/momento-config/calibration.json and use `docker compose -f deploy/moderation-compose.yml up -d --build`. The worker and model service share a private loopback interface. For direct execution, set NSFW_PIPELINE=three-stage and NSFW_CALIBRATION to the table path, then run `npm run moderation:worker`. Enable NSFW_PIPELINE=three-stage on the API after verifying the worker against the same database and bucket. Keep the worker running to drain existing jobs if intake is rolled back.

## Stage one only

With NSFW_PIPELINE=stage-one the API runs MobileNetV2 itself and needs no worker or model service. Calibrate only the first check:

```sh
node scripts/labelPhotos.js <photo folder>   # label in the browser at http://localhost:4100, then Export
NSFW_PIPELINE=stage-one node scripts/calibrateModeration.js <photo folder>/fit.jsonl <photo folder>/holdout.jsonl calibration.json
```

**It learns by itself.** Staff rate waiting photos on Momento's 0-100 scale on the review page (`review.html`, "Photo review" under Account settings, staff plan only). On start-up and every `NSFW_RELEARN_HOURS` (24) the API rebuilds the stage-one table from all staff ratings and keeps it in MongoDB (`moderationcalibrations`); a rebuild with too little data keeps the previous table. Until the learned table supports a score range, a starter rule applies: an "everyday" score (MobileNetV2 Neutral + Drawing) of `NSFW_STARTER_THRESHOLD` (0.98) or more publishes. `NSFW_SPOT_CHECK` (10%) of the photos the model would publish still go to staff, so ratings keep covering confident photos too. The review page shows which rule is active and can relearn on demand.

A table file can still be pinned instead of the learned one: calibrate from staff decisions by hand. While uncalibrated every upload waits for staff, and each decision keeps the MobileNetV2 score. Staff send the content level with each decision (`POST /api/admin/moderation/:id { allow, severity: 0|15|25|50|75|100 }`); once a few hundred uploads from many albums are reviewed, run on the AWS server:

```sh
cd /opt/momento/Server/deploy && sudo docker compose exec -T api node scripts/calibrateFromReviews.js > /tmp/calibration.json \
  && sudo install -m 644 /tmp/calibration.json /opt/momento-config/calibration.json
```

The table is installed only when the run succeeds. A missing or unreadable table never stops the API: every upload then waits for staff.

For the labelling tool, put one subfolder per event in the photo folder. The labelling tool never shows model scores, keeps each event in one split and skips byte-identical copies. On the AWS server copy the table to /opt/momento-config/calibration.json, add NSFW_CALIBRATION=/config/calibration.json to server.env and run `sudo momento-update`.

## Audits and review

Each worker checks at most one due album photo per minute, waiting 60 seconds after each audit pass. New uploads use a separate queue. A nudity report schedules a context check; routine reviews yield to queued uploads. Older photos are eligible on rollout and checked again after 30 days. Uncertain findings open a staff report, and strong explicit findings also hide the image. Existing staff routes handle report dismissal and takedown. Staff can inspect a private image with GET /api/admin/reports/:id/preview or GET /api/admin/moderation/:id/preview. Upload approvals are published by the worker. Declined private files are retained for 30 days for review. Model failures never make a pending image public.

Measure upload acknowledgement, time to first published photo, total moderation time, queue age and ordinary page latency on the target web host under concurrent uploads. Local functional tests use injected model scores and an isolated database. Run them with `npm run test:moderation`.
