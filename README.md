# 🕳️ PotholeAlertBD

বাংলাদেশের রাস্তার গর্ত নাগরিকদের পক্ষ থেকে রিপোর্ট করার একটি অ্যাপ — ছবি ও অবস্থান শেয়ার করে,
সম্পূর্ণ বাংলা ইন্টারফেসে, নাম-পরিচয় প্রকাশ ছাড়াই। [ghush.site](https://www.ghush.site)-এর
স্বচ্ছতা-ভিত্তিক, বিভাগ-অনুযায়ী মানচিত্র ও পরিসংখ্যান দেখানোর ধরন থেকে অনুপ্রাণিত।

একটিমাত্র Flutter কোডবেস থেকে **Android, iPhone এবং ওয়েব** — তিন জায়গাতেই চলে।

```
PotholeAlertBD/
├── app/        ← Flutter অ্যাপ (Android + iOS + Web)
└── backend/    ← Node.js API সার্ভার (রিপোর্ট সংরক্ষণ, বিভাগ/কর্তৃপক্ষ শনাক্তকরণ, ফরওয়ার্ডিং)
```

## কীভাবে কাজ করে

1. একজন ব্যবহারকারী গর্তের ছবি তোলেন/আপলোড করেন এবং GPS দিয়ে অবস্থান শেয়ার করেন (মানচিত্রে ট্যাপ করে
   ঠিক করাও যায়)।
2. রাস্তার ধরন (জাতীয় মহাসড়ক/শহরের রাস্তা/গ্রামীণ রাস্তা ইত্যাদি) নির্বাচন করেন।
3. Backend অবস্থান থেকে বিভাগ (ঢাকা/চট্টগ্রাম/... ) এবং রাস্তার ধরন থেকে দায়িত্বপ্রাপ্ত কর্তৃপক্ষ
   (RHD/সিটি কর্পোরেশন/LGED/ইউনিয়ন পরিষদ) স্বয়ংক্রিয়ভাবে নির্ণয় করে।
4. SMTP কনফিগার করা থাকলে রিপোর্ট ইমেইলে ফরওয়ার্ড হয়; না থাকলে "queued_for_authority" হিসেবে
   জমা থাকে, এডমিন প্যানেলে দৃশ্যমান।
5. সব রিপোর্ট একটি পাবলিক ফিড, মানচিত্র ও বিভাগ-ভিত্তিক পরিসংখ্যানে দেখা যায়।

## ⚠️ চালু করার আগে জেনে রাখুন

- **কর্তৃপক্ষের যোগাযোগের তথ্য (ইমেইল/ফোন) ফাঁকা রাখা হয়েছে** — বানোয়াট সরকারি ইমেইল দেওয়া হয়নি।
  বাস্তব ব্যবহারের আগে `backend/src/authorities.js`-এ `AUTHORITY_DIRECTORY`-তে যাচাইকৃত যোগাযোগের
  তথ্য যোগ করুন।
- **বিভাগ শনাক্তকরণ আনুমানিক** — lat/lng থেকে নিকটতম বিভাগীয় কেন্দ্রবিন্দু হিসাব করে বিভাগ ধরা হয়, এটি
  সঠিক geocoding নয়। সীমান্তবর্তী এলাকায় ভুল হতে পারে।
- এটি কোনো সরকারি আনুষ্ঠানিক অভিযোগ ব্যবস্থা নয় — নাগরিক সচেতনতা ও তথ্য সংগ্রহের একটি স্বাধীন টুল।

## Backend চালানো

```bash
cd backend
npm install
cp .env.example .env      # ADMIN_TOKEN বদলে দিন; চাইলে SMTP তথ্য দিন
npm start                 # http://localhost:4000
```

- Health check: `GET /api/health`
- এডমিন প্যানেল: `http://localhost:4000/admin.html` (ADMIN_TOKEN দিয়ে লগইন করুন)
- Node.js-এর বিল্ট-ইন `node:sqlite` ব্যবহার করা হয়েছে — তাই আলাদা ডাটাবেজ সার্ভার বা নেটিভ কম্পাইলেশনের
  দরকার নেই। **Node ≥ 22.5 আবশ্যক।**

### API সংক্ষেপে

| Method | Path | বিবরণ |
|---|---|---|
| POST | `/api/reports` | নতুন রিপোর্ট (multipart: `photo`, `lat`, `lng`, `roadType`, `severity`, ...) |
| GET | `/api/reports?division=&roadType=&status=` | ফিল্টারসহ রিপোর্টের তালিকা |
| GET | `/api/reports/:id` | একটি রিপোর্টের বিবরণ |
| PATCH | `/api/reports/:id/status` | স্ট্যাটাস আপডেট (হেডার `x-admin-token` আবশ্যক) |
| GET | `/api/stats` | মোট/বিভাগ/রাস্তার ধরন/তীব্রতা অনুযায়ী পরিসংখ্যান |

## Flutter অ্যাপ চালানো

```bash
cd app
flutter pub get

# ওয়েব (দ্রুততম টেস্ট করার উপায়):
flutter run -d chrome

# Android এমুলেটর/ডিভাইস:
flutter run -d android

# iOS সিমুলেটর/ডিভাইস (macOS + Xcode আবশ্যক):
flutter run -d ios
```

ডিফল্টভাবে অ্যাপ `http://localhost:4000` (ওয়েব/iOS সিমুলেটর) বা `http://10.0.2.2:4000`
(Android এমুলেটর) থেকে backend খোঁজে। আসল ফোনে টেস্ট করতে backend যে কম্পিউটারে চলছে সেটার
LAN IP ব্যবহার করুন:

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.x.x:4000
```

### অ্যাপ স্ট্রাকচার

```
app/lib/
├── main.dart                  ← এন্ট্রি পয়েন্ট, থিম ও লোকালাইজেশন সেটআপ
├── models/report.dart         ← PotholeReport মডেল + রাস্তার ধরন/বিভাগ/স্ট্যাটাসের বাংলা লেবেল
├── services/
│   ├── api_service.dart       ← backend API কল
│   ├── location_service.dart  ← GPS/লোকেশন পারমিশন হ্যান্ডলিং
│   └── reports_provider.dart  ← শেয়ার্ড স্টেট (Feed/Map/Stats একসাথে ব্যবহার করে)
├── screens/
│   ├── home_shell.dart         ← বটম ন্যাভিগেশন + "রিপোর্ট করুন" FAB
│   ├── feed_screen.dart        ← ফিল্টারসহ রিপোর্টের তালিকা
│   ├── map_screen.dart         ← OpenStreetMap-ভিত্তিক মানচিত্র (flutter_map)
│   ├── stats_screen.dart       ← বিভাগ-ভিত্তিক পরিসংখ্যান (ghush.site-অনুপ্রাণিত)
│   ├── report_form_screen.dart← ছবি তোলা/আপলোড + অবস্থান + বিবরণ জমা দেওয়ার ফর্ম
│   ├── report_detail_screen.dart
│   └── about_screen.dart      ← গোপনীয়তা ও দাবিত্যাগ
├── theme/app_theme.dart
└── widgets/
```

## Android/iOS অ্যাপ-স্টোর বিল্ড

এই কোডবেস Android/iOS/Web তিনটির জন্যই প্রস্তুত, কিন্তু আসল প্লে স্টোর/অ্যাপ স্টোরে প্রকাশ করতে
আপনার নিজের Google Play / Apple Developer অ্যাকাউন্ট ও সাইনিং কী দরকার হবে:

```bash
flutter build apk --release        # Android APK
flutter build appbundle --release  # Play Store-এর জন্য AAB
flutter build ios --release        # iOS (Xcode দিয়ে archive/upload করতে হবে)
flutter build web --release        # যেকোনো স্ট্যাটিক হোস্টিং-এ ডিপ্লয়যোগ্য
```

## API notes

- Uploaded photos are re-encoded with `sharp` (EXIF/GPS metadata stripped, orientation applied).
- `CORS_ORIGINS` (comma-separated) sets the CORS allow-list; unset means same-origin only.
- `GET /api/reports` and `GET /api/reports/admin/all` accept `limit` (default 50, max 200) and `offset`; total count is in the `X-Total-Count` header. Body stays a JSON array.
- Duplicate reports (same road type, within `DUP_RADIUS_M`=30 m, within `DUP_WINDOW_HOURS`=24 h) are not stored: `POST /api/reports` returns 200 with the existing report plus `duplicate: true` (new reports return 201).

## Admins, authorities and privacy

- **Admins.** The shared `ADMIN_TOKEN` signs in as `root`. Per-admin tokens are created with `node scripts/manage.js add-admin <name>`. The admin panel (`/admin.html`) shows reports, the token list (rotate/revoke) and the audit log (`GET /api/reports/admin/tokens`, `/admin/audit`). Every admin action is logged (actor = admin name, or `root` for the shared token); `GET /api/reports/admin/audit?actor=alice` filters one admin.
  - *Migration from the single shared token (backward compatible):* 1) keep `ADMIN_TOKEN` as is, nothing breaks; 2) `add-admin <name>` for each person and hand out the printed token; 3) check in the audit log that actions now carry names, not `root`; 4) set `DISABLE_ROOT_TOKEN=1` and restart. The shared token is then rejected, and production no longer demands `ADMIN_TOKEN` but needs at least one enabled admin. To roll back, unset the flag.
- **Authority inbox.** `/authority.html` lets one authority see only its own reports, never contact fields or hidden reports (`/api/authority/*`, header `x-authority-token`). Create one with `node scripts/manage.js add-authority "<authority name>" [email]`.
- **Tokens.** Tokens are printed once; only their SHA-256 is stored. They expire after `TOKEN_TTL_DAYS` (default 180).
- **Digest.** `node scripts/manage.js digest` emails each authority its new reports (run it from cron; it needs SMTP and `PUBLIC_URL`). `digest --dry-run` prints what it would send and sends nothing.
- **Reporter privacy.** After submitting, the app shows a one-time deletion code. The app's About → "Erase my contact details" screen (or `POST /api/reports/:id/erase-contact {code}`) uses it to erase the reporter's name and phone; the app does not store the code. Contacts are also erased automatically after `CONTACT_RETENTION_DAYS` (default 90); `manage.js purge` runs that erasure now.
- **Abuse.** `POST /api/reports/:id/flag` lets the public flag a report; enough flags from distinct IPs hide it automatically, and admins can unhide it. Rate limits, failed-auth counters and flag dedupe (one flag per IP per report) are stored in the SQLite database, so they survive restarts and are shared by instances using the same database file (300 API calls per minute per IP, tighter limits on submit, flag and erase). Set `TRUST_PROXY` behind a reverse proxy.

Full command list: `node scripts/manage.js` (see the usage line at the top of `scripts/manage.js`). Tests: `cd backend && npm test`.
