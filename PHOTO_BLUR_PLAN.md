# Face and licence-plate blurring plan

Status (2026-10-30): the pipeline is built, with no model. `PHOTO_REVIEW=1` (step 1) and the `PHOTO_DETECTOR` hook in `savePhoto` (step 2: mean-colour fill of each box +20%, fail closed, only the blurred file is written, both paths) are in `backend/src/photos.js` with tests. Not done: a face or plate model, the accuracy set, load numbers, on-device blurring. Written 2026-10-22 as a plan. Closes the "blurring plan" half of judge.md Update 8, step 7, and PRD.md section 9, item 6 (constraint C-7). Image moderation for illegal content is a separate problem and is not covered here.

## Today

- Report photos and authority after-photos both go through `savePhoto` in `backend/src/photos.js`: magic-byte type check, a 40 MP decode limit, then a `sharp` re-encode that drops EXIF and GPS. Uploads are held in memory (`multer.memoryStorage`) and only the re-encoded file is written.
- A photo is public at `/uploads/<uuid>` as soon as the report is created, and `photoUrl` is in the public serializer. It goes private only when an admin hides the report or three distinct IPs flag it.
- The app picks photos with `image_picker` (`maxWidth: 1600`, quality 85) on Android, iOS and web.
- Nothing detects faces or plates. Bystanders, parked cars, house numbers and shop signs are published as taken.

## Goal

Before a photo becomes public, every face and licence plate in it is blurred so it cannot be reversed, and the pothole stays visible. If the blur step fails, the photo stays private (fail closed).

## Options

| Option | How | Privacy | Weak points |
|---|---|---|---|
| A. On-device | Detect and blur in the app before upload. Faces: Google ML Kit face detection (Android, iOS). Plates: no ready model; ML Kit text recognition does not cover Bangla script, and Bangladeshi plates are in Bangla, so it needs a custom TFLite plate detector. | Best: the original never leaves the phone. | Cannot be enforced: an old app build, the web build (no ML Kit) or a direct API POST skips it. Adds app size, is slow on low-end phones, and a model update needs an app release. |
| B. Server, in the upload path | Run a face detector (for example OpenCV's YuNet) and a plate detector (an object detector fine-tuned on Bangladeshi plates, ONNX) inside `savePhoto`, before the file is written. | Good: the original exists only in server memory for the request, never on disk or in backups. | CPU per upload (budget it on the real host), a native dependency, and a model to train or find. Check weight licences: Ultralytics YOLO weights are AGPL-3.0. |
| C. Cloud vision API | Send each photo to a hosted face or plate service. | Worst: every citizen photo goes to a third party, which the privacy page would have to disclose (possibly a cross-border transfer). | Cost per image, vendor terms, and unknown accuracy on Bangla plates. Not recommended. |
| D. Moderation first | Photos stay private until an admin approves them; the admin rejects or crops by hand. | Good, and also catches illegal images. | Admin workload and a delay before a report is visible. Does not scale. |

## Recommendation

1. **Before any public launch, if B is not ready:** use D. New photos are admin-only until approved. This is the smallest change and fails closed.
2. **Then B, as the enforcement point:** blur inside `savePhoto` for report and after-photos alike. Pad each box by about 20% and use a heavy pixelate plus Gaussian blur (a light blur can be partly undone). Tune for recall: blurring a bit of road is better than missing a face. If the detector throws or times out, store the report with the photo private and queue it for an admin. Keep only the blurred file. Do not keep originals, not even for authorities: they need the pothole, not faces, and a stored original is a leak and doxxing risk.
3. **Later, A on Android and iOS** as an extra layer once a plate model exists, so most originals never leave the phone. The server check stays, because the client cannot be trusted.
4. Keep the flag button as the net for misses; consider a "face or plate visible" flag reason.

## Privacy trade-offs to decide

- Server-side blurring means the server sees the original for a moment. On-device blurring avoids that but cannot be enforced. The hybrid (3) gets both, at the cost of two models to maintain.
- Discarding originals means a blur mistake over the pothole cannot be fixed; the reporter must resubmit. Keeping them is a store of unblurred faces. Recommended: discard.
- No copy may say "faces and plates are blurred" until recall is measured (CODING_STANDARDS: Unverified). When it ships, update `privacy.html` and the About screen in the same change (CODING_STANDARDS: Privacy copy).

## What to test

- **Accuracy set:** about 200 real Dhaka and Chattogram street photos (own photos or with consent, not scraped), hand-labelled for faces and plates. Cover front and rear plates, Bangla and English plates, cars, buses, CNGs, motorbikes and rickshaws, night, rain, motion blur, and small or distant faces. Report recall per class and the share of the pothole area blurred by mistake. Starting targets (proposals, UNVERIFIED): face recall 95%, plate recall 90%.
- **Irreversible:** run the detector on the blurred output and expect zero detections; the pixel variance inside each box is near zero.
- **Fail closed:** a detector that throws or times out leaves the photo private (backend test with a stubbed detector).
- **Nothing unblurred on disk:** after an upload, `UPLOAD_DIR` holds only the blurred file, and no log line contains image bytes.
- **Existing guards still hold:** EXIF and GPS stripped, the 40 MP limit is checked before detection, type sniffing.
- **Both paths:** report photos and authority after-photos.
- **Load:** p95 time and peak memory per 1600 px upload on the target host CPU, and with several uploads at once.
- **If on-device ships:** a unit test of the blur function and a run on a low-end Android phone.
