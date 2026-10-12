import 'package:flutter/material.dart';

import '../models/report.dart';
import 'api_service.dart';

/// রিপোর্টের তালিকা ও ফিল্টার—Feed, Map, Stats স্ক্রিন সবগুলো এটি শেয়ার করে,
/// যাতে নতুন রিপোর্ট জমা দেওয়ার পর সব জায়গায় একবারেই রিফ্রেশ হয়।
class ReportsProvider extends ChangeNotifier {
  List<PotholeReport> _reports = [];
  bool _loading = false;
  String? _error;

  String? divisionFilter;
  String? roadTypeFilter;
  String? statusFilter;

  List<PotholeReport> get reports => _reports;
  bool get loading => _loading;
  String? get error => _error;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _reports = await ApiService.fetchReports(
        division: divisionFilter,
        roadType: roadTypeFilter,
        status: statusFilter,
      );
    } catch (e) {
      _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  void setFilters({String? division, String? roadType, String? status}) {
    divisionFilter = division;
    roadTypeFilter = roadType;
    statusFilter = status;
    load();
  }

  void clearFilters() {
    divisionFilter = null;
    roadTypeFilter = null;
    statusFilter = null;
    load();
  }
}
