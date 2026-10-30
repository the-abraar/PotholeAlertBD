'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 10, fieldSize: 4096 },
});

const MAX_INPUT_PIXELS = 40e6; // sharp default is ~268MP; decompression-bomb guard

// Extension comes from magic bytes, never from the client filename or mimetype.
function sniffImageExt(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
}

// Face/plate detector (PHOTO_BLUR_PLAN.md option B): a module exporting async (buffer) => [{ x, y, w, h }] in pixels
// of the upright image. Unset = no detection. A test can replace api.detector.
const DETECT_TIMEOUT_MS = 10_000;

// Pads each box by 20% and fills it with its mean colour: irreversible, unlike a light blur.
async function blurRegions(buffer, boxes) {
  const { width, height } = await sharp(buffer).metadata();
  const overlays = [];
  for (const b of boxes) {
    if (![b.x, b.y, b.w, b.h].every(Number.isFinite)) throw new Error('detector returned a bad box'); // fail closed, never skip
    const left = Math.max(0, Math.floor(b.x - b.w * 0.2)), top = Math.max(0, Math.floor(b.y - b.h * 0.2));
    const w = Math.min(width, Math.ceil(b.x + b.w * 1.2)) - left, h = Math.min(height, Math.ceil(b.y + b.h * 1.2)) - top;
    if (!(w > 0 && h > 0)) continue;
    const { channels } = await sharp(await sharp(buffer).extract({ left, top, width: w, height: h }).toBuffer()).stats(); // stats() ignores extract()
    const mean = channels.slice(0, 3).map((c) => Math.round(c.mean));
    overlays.push({ input: { create: { width: w, height: h, channels: 3, background: { r: mean[0], g: mean[1], b: mean[2] } } }, left, top });
  }
  return overlays.length ? sharp(buffer).composite(overlays).toBuffer() : buffer;
}

// Returns the photo with faces/plates blurred, or null if the detector failed (caller must keep the photo private).
async function blurSensitive(photo) {
  if (!api.detector) return photo;
  let timer;
  try {
    const boxes = await Promise.race([api.detector(photo),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('detector timeout')), DETECT_TIMEOUT_MS); })]);
    return await blurRegions(photo, boxes);
  } catch (e) {
    console.error('photo detector failed:', e.message);
    return null;
  } finally { clearTimeout(timer); }
}

// Validates, re-encodes, blurs and stores an uploaded image. Returns { filename, held } or { status, error }.
// held = the detector failed, so the stored photo is NOT blurred and must stay private.
// requireBlur = refuse instead of storing an unblurred photo (the caller cannot keep it private).
async function savePhoto(buffer, { requireBlur = false } = {}) {
  const ext = sniffImageExt(buffer);
  if (!ext) return { status: 400, error: 'শুধুমাত্র JPEG/PNG/WebP ছবি' };
  let photo;
  try { photo = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().toBuffer(); } // rotate() bakes in EXIF orientation; output carries no metadata (EXIF/GPS)
  catch (e) {
    if (/pixel limit/i.test(e.message)) return { status: 413, error: 'ছবির রেজোলিউশন খুব বেশি (image too large)' };
    return { status: 400, error: 'ছবি পড়া যায়নি (invalid image)' };
  }
  const blurred = await blurSensitive(photo);
  if (!blurred && requireBlur) return { status: 503, error: 'ছবি যাচাই করা যায়নি, আবার চেষ্টা করুন (photo check failed, try again)' };
  const filename = `${uuidv4()}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), blurred || photo);
  return { filename, held: !blurred };
}

function removePhotos(...filenames) {
  for (const f of filenames) if (f) fs.rmSync(path.join(UPLOAD_DIR, path.basename(f)), { force: true });
}

const api = module.exports = { UPLOAD_DIR, upload, sniffImageExt, savePhoto, removePhotos, blurRegions,
  detector: process.env.PHOTO_DETECTOR ? require(path.resolve(process.env.PHOTO_DETECTOR)) : null };
