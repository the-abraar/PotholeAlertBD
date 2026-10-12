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

// Validates, re-encodes and stores an uploaded image. Returns { filename } or { status, error }.
async function savePhoto(buffer) {
  const ext = sniffImageExt(buffer);
  if (!ext) return { status: 400, error: 'শুধুমাত্র JPEG/PNG/WebP ছবি' };
  let photo;
  try { photo = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().toBuffer(); } // rotate() bakes in EXIF orientation; output carries no metadata (EXIF/GPS)
  catch (e) {
    if (/pixel limit/i.test(e.message)) return { status: 413, error: 'ছবির রেজোলিউশন খুব বেশি (image too large)' };
    return { status: 400, error: 'ছবি পড়া যায়নি (invalid image)' };
  }
  const filename = `${uuidv4()}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), photo);
  return { filename };
}

function removePhotos(...filenames) {
  for (const f of filenames) if (f) fs.rmSync(path.join(UPLOAD_DIR, path.basename(f)), { force: true });
}

module.exports = { UPLOAD_DIR, upload, sniffImageExt, savePhoto, removePhotos };
