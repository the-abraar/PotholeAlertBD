'use strict';

const { ROAD_TYPE_LABELS } = require('./authorities');

function serializeReport(row) {
  return {
    id: row.id,
    photoUrl: `/uploads/${row.photo_filename}`,
    afterPhotoUrl: row.after_photo_filename ? `/uploads/${row.after_photo_filename}` : null,
    lat: row.lat,
    lng: row.lng,
    divisionKey: row.division_key,
    divisionName: row.division_name,
    roadType: row.road_type,
    roadTypeLabel: ROAD_TYPE_LABELS[row.road_type] || row.road_type,
    placeNote: row.place_note,
    severity: row.severity,
    description: row.description,
    authorityName: row.authority_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeAdminReport(row) {
  return { ...serializeReport(row), contactName: row.contact_name, contactPhone: row.contact_phone };
}

module.exports = { serializeReport, serializeAdminReport };
