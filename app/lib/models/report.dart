class PotholeReport {
  final String id;
  final String photoUrl;
  final double lat;
  final double lng;
  final String? divisionKey;
  final String? divisionName;
  final String roadType;
  final String roadTypeLabel;
  final String? placeNote;
  final String severity;
  final String? description;
  final String? contactName;
  final String? contactPhone;
  final String authorityName;
  final String status;
  final DateTime createdAt;
  final DateTime updatedAt;
  /// true when the backend merged this submission into an existing nearby report.
  final bool duplicate;
  /// One-time code returned only by a fresh 201 submit; erases the reporter's name and phone.
  final String? deletionCode;

  PotholeReport({
    required this.id,
    required this.photoUrl,
    required this.lat,
    required this.lng,
    this.divisionKey,
    this.divisionName,
    required this.roadType,
    required this.roadTypeLabel,
    this.placeNote,
    required this.severity,
    this.description,
    this.contactName,
    this.contactPhone,
    required this.authorityName,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.duplicate = false,
    this.deletionCode,
  });

  factory PotholeReport.fromJson(Map<String, dynamic> json) {
    return PotholeReport(
      id: json['id'] as String,
      photoUrl: json['photoUrl'] as String,
      lat: (json['lat'] as num).toDouble(),
      lng: (json['lng'] as num).toDouble(),
      divisionKey: json['divisionKey'] as String?,
      divisionName: json['divisionName'] as String?,
      roadType: json['roadType'] as String,
      roadTypeLabel: json['roadTypeLabel'] as String,
      placeNote: json['placeNote'] as String?,
      severity: json['severity'] as String,
      description: json['description'] as String?,
      contactName: json['contactName'] as String?,
      contactPhone: json['contactPhone'] as String?,
      authorityName: json['authorityName'] as String,
      status: json['status'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
      duplicate: json['duplicate'] == true,
      deletionCode: json['deletionCode'] as String?,
    );
  }
}

/// রাস্তার ধরন — dropdown-এ দেখানোর জন্য (key, বাংলা লেবেল)
const List<MapEntry<String, String>> kRoadTypes = [
  MapEntry('national_highway', 'জাতীয় মহাসড়ক'),
  MapEntry('regional_highway', 'আঞ্চলিক মহাসড়ক'),
  MapEntry('city_road', 'শহরের রাস্তা (সিটি কর্পোরেশন/পৌরসভা)'),
  MapEntry('rural_road', 'গ্রামীণ/উপজেলা রাস্তা'),
  MapEntry('residential', 'আবাসিক এলাকার রাস্তা'),
  MapEntry('other', 'অন্যান্য'),
];

const List<MapEntry<String, String>> kSeverities = [
  MapEntry('low', 'সামান্য'),
  MapEntry('medium', 'মাঝারি'),
  MapEntry('high', 'বিপজ্জনক'),
];

const Map<String, String> kStatusLabels = {
  'new': 'নতুন',
  'queued_for_authority': 'কর্তৃপক্ষের জন্য সারিবদ্ধ',
  'forwarded': 'কর্তৃপক্ষের কাছে প্রেরিত',
  'in_progress': 'কাজ চলছে',
  'resolved': 'সমাধান হয়েছে',
  'rejected': 'বাতিল',
};

const Map<String, String> kDivisionNames = {
  'dhaka': 'ঢাকা',
  'chattogram': 'চট্টগ্রাম',
  'rajshahi': 'রাজশাহী',
  'khulna': 'খুলনা',
  'barishal': 'বরিশাল',
  'sylhet': 'সিলেট',
  'rangpur': 'রংপুর',
  'mymensingh': 'ময়মনসিংহ',
};
