'use strict';

/**
 * Division classification + authority routing.
 *
 * IMPORTANT: Division detection below uses rough centroid-nearest-neighbour
 * math on lat/lng, which is only approximate (good enough to route a report
 * to the right department, not survey-grade geocoding).
 *
 * IMPORTANT: The `contact` fields in AUTHORITY_DIRECTORY are intentionally
 * left blank. Real government contact emails/phone numbers were NOT
 * fabricated here — an admin must fill in verified contacts (via the
 * ADMIN_TOKEN-protected API or by editing this file) before the app can
 * actually forward reports by email. Until then, reports are queued with
 * status "queued_for_authority" and simply show which authority is
 * responsible, so nothing is silently sent to an unverified address.
 */

const { resolveJurisdiction } = require('./jurisdictions');

const DIVISIONS = [
  { key: 'dhaka', name: 'ঢাকা', lat: 23.8103, lng: 90.4125 },
  { key: 'chattogram', name: 'চট্টগ্রাম', lat: 22.3569, lng: 91.7832 },
  { key: 'rajshahi', name: 'রাজশাহী', lat: 24.3745, lng: 88.6042 },
  { key: 'khulna', name: 'খুলনা', lat: 22.8456, lng: 89.5403 },
  { key: 'barishal', name: 'বরিশাল', lat: 22.7010, lng: 90.3535 },
  { key: 'sylhet', name: 'সিলেট', lat: 24.8949, lng: 91.8687 },
  { key: 'rangpur', name: 'রংপুর', lat: 25.7439, lng: 89.2752 },
  { key: 'mymensingh', name: 'ময়মনসিংহ', lat: 24.7471, lng: 90.4203 },
];

function detectDivision(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }
  let best = null;
  let bestDist = Infinity;
  for (const d of DIVISIONS) {
    const dist = Math.hypot(d.lat - lat, d.lng - lng);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

// Road type -> responsible authority. Keys match the `roadType` field
// submitted from the app.
const ROAD_TYPE_LABELS = {
  national_highway: 'জাতীয় মহাসড়ক',
  regional_highway: 'আঞ্চলিক মহাসড়ক',
  city_road: 'শহরের রাস্তা (সিটি কর্পোরেশন/পৌরসভা)',
  rural_road: 'গ্রামীণ/উপজেলা রাস্তা',
  residential: 'আবাসিক এলাকার রাস্তা',
  other: 'অন্যান্য',
};

const AUTHORITY_DIRECTORY = {
  national_highway: {
    name: 'সড়ক ও জনপথ অধিদপ্তর (RHD)',
    jurisdiction: 'জাতীয় ও আঞ্চলিক মহাসড়ক রক্ষণাবেক্ষণ',
    contact: { email: null, phone: null },
  },
  regional_highway: {
    name: 'সড়ক ও জনপথ অধিদপ্তর (RHD)',
    jurisdiction: 'জাতীয় ও আঞ্চলিক মহাসড়ক রক্ষণাবেক্ষণ',
    contact: { email: null, phone: null },
  },
  city_road: {
    name: 'সিটি কর্পোরেশন / পৌরসভা প্রকৌশল বিভাগ',
    jurisdiction: 'শহর এলাকার রাস্তা রক্ষণাবেক্ষণ — নির্দিষ্ট সিটি কর্পোরেশন/পৌরসভার নাম রিপোর্টে উল্লেখ থাকে',
    contact: { email: null, phone: null },
  },
  rural_road: {
    name: 'স্থানীয় সরকার প্রকৌশল অধিদপ্তর (LGED)',
    jurisdiction: 'উপজেলা ও গ্রামীণ রাস্তা রক্ষণাবেক্ষণ',
    contact: { email: null, phone: null },
  },
  residential: {
    name: 'ইউনিয়ন পরিষদ / ওয়ার্ড কার্যালয়',
    jurisdiction: 'স্থানীয় আবাসিক এলাকার অবকাঠামো',
    contact: { email: null, phone: null },
  },
  other: {
    name: 'স্থানীয় সিটি কর্পোরেশন/উপজেলা প্রশাসন',
    jurisdiction: 'সাধারণ অভিযোগ গ্রহণকারী দপ্তর',
    contact: { email: null, phone: null },
  },
};

// Polygon jurisdiction (placeholder data) wins; road-type map is the fallback.
function resolveAuthority(roadType, lat, lng) {
  const j = typeof lat === 'number' ? resolveJurisdiction(lat, lng) : null;
  if (j && roadType !== 'national_highway' && roadType !== 'regional_highway') {
    return { name: j.name, jurisdiction: 'APPROXIMATE (placeholder polygon)', contact: { email: null, phone: null } };
  }
  return AUTHORITY_DIRECTORY[roadType] || AUTHORITY_DIRECTORY.other;
}

module.exports = {
  DIVISIONS,
  ROAD_TYPE_LABELS,
  AUTHORITY_DIRECTORY,
  detectDivision,
  resolveAuthority,
};
