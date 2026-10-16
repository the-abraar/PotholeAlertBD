import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb, kDebugMode;
import 'package:http/http.dart' as http;
import 'package:universal_io/io.dart' show Platform;

import '../models/report.dart';

/// Backend base URL.
///
/// - ওয়েবে: একই হোস্ট থেকে backend চালানো থাকলে localhost:4000 কাজ করবে।
/// - Android এমুলেটরে: 10.0.2.2 দিয়ে হোস্ট মেশিনের localhost অ্যাক্সেস করা যায়।
/// - iOS সিমুলেটরে: localhost সরাসরি কাজ করে।
/// - আসল ফোনে টেস্ট করতে হলে এই মান আপনার কম্পিউটারের LAN IP দিয়ে বদলে দিন,
///   অথবা --dart-define=API_BASE_URL=http://192.168.x.x:4000 দিয়ে রান করুন।
String get _defaultBaseUrl {
  if (kIsWeb) return 'http://localhost:4000';
  try {
    if (Platform.isAndroid) return 'http://10.0.2.2:4000';
  } catch (_) {
    // Platform not available (shouldn't happen outside web, but stay safe).
  }
  return 'http://localhost:4000';
}

const String _override = String.fromEnvironment('API_BASE_URL');

class ApiService {
  static String get baseUrl => _override.isNotEmpty ? _override : _defaultBaseUrl;

  static Future<List<PotholeReport>> fetchReports({
    String? division,
    String? roadType,
    String? status,
  }) async {
    final params = <String, String>{};
    if (division != null && division.isNotEmpty) params['division'] = division;
    if (roadType != null && roadType.isNotEmpty) params['roadType'] = roadType;
    if (status != null && status.isNotEmpty) params['status'] = status;

    final uri = Uri.parse('$baseUrl/api/reports').replace(queryParameters: params.isEmpty ? null : params);
    final res = await http.get(uri);
    if (res.statusCode != 200) {
      throw Exception('রিপোর্ট লোড করা যায়নি (${res.statusCode})');
    }
    final list = jsonDecode(utf8.decode(res.bodyBytes)) as List;
    return list.map((e) => PotholeReport.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<Map<String, dynamic>> fetchStats() async {
    final res = await http.get(Uri.parse('$baseUrl/api/stats'));
    if (res.statusCode != 200) {
      throw Exception('পরিসংখ্যান লোড করা যায়নি (${res.statusCode})');
    }
    return jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
  }

  static Future<PotholeReport> submitReport({
    required Uint8List photoBytes,
    required String photoFilename,
    required double lat,
    required double lng,
    required String roadType,
    required String severity,
    String? description,
    String? placeNote,
    String? contactName,
    String? contactPhone,
  }) async {
    final uri = Uri.parse('$baseUrl/api/reports');
    final request = http.MultipartRequest('POST', uri)
      ..fields['lat'] = lat.toString()
      ..fields['lng'] = lng.toString()
      ..fields['roadType'] = roadType
      ..fields['severity'] = severity
      ..files.add(http.MultipartFile.fromBytes('photo', photoBytes, filename: photoFilename));

    if (description != null && description.isNotEmpty) request.fields['description'] = description;
    if (placeNote != null && placeNote.isNotEmpty) request.fields['placeNote'] = placeNote;
    if (contactName != null && contactName.isNotEmpty) request.fields['contactName'] = contactName;
    if (contactPhone != null && contactPhone.isNotEmpty) request.fields['contactPhone'] = contactPhone;

    final streamed = await request.send();
    final res = await http.Response.fromStream(streamed);

    if (kDebugMode && res.statusCode >= 400) {
      // ignore: avoid_print
      print('submitReport failed: ${res.statusCode} ${res.body}');
    }

    // 201 = created, 200 = duplicate of an existing report (response has duplicate: true)
    if (res.statusCode != 201 && res.statusCode != 200) {
      final body = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      throw Exception(body['error'] ?? 'রিপোর্ট জমা দেওয়া যায়নি');
    }
    return PotholeReport.fromJson(jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>);
  }

  /// Erases the reporter's name and phone from one report, authorised by its one-time deletion code.
  /// Throws with a bilingual message on a wrong code (403), too many tries (429) or another failure.
  static Future<void> eraseContact({required String reportId, required String code, http.Client? client}) async {
    final c = client ?? http.Client();
    try {
      final http.Response res;
      try {
        res = await c.post(
          Uri.parse('$baseUrl/api/reports/${Uri.encodeComponent(reportId)}/erase-contact'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'code': code}),
        );
      } on http.ClientException {
        throw Exception('সার্ভারে পৌঁছানো যায়নি, ইন্টারনেট দেখে আবার চেষ্টা করুন / Could not reach the server; check your connection and try again');
      }
      if (res.statusCode == 200) return;
      // The backend answers 403 for both an unknown report ID and a wrong code.
      if (res.statusCode == 403) throw Exception('রিপোর্ট আইডি বা কোড মেলেনি / Report ID or code does not match');
      // 429 comes from the erase limit (10 per hour per IP) or the global per-minute API limit.
      if (res.statusCode == 429) throw Exception('অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ (এক ঘণ্টা পর্যন্ত) পরে আবার চেষ্টা করুন / Too many tries; try again later (up to an hour)');
      throw Exception('মুছে ফেলা যায়নি (${res.statusCode}) / Could not erase');
    } finally {
      if (client == null) c.close();
    }
  }

  static String get privacyUrl => '$baseUrl/privacy';

  static String photoFullUrl(String relativeUrl) => '$baseUrl$relativeUrl';
}
