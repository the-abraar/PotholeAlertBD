import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/report.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/badges.dart';

class ReportDetailScreen extends StatelessWidget {
  final PotholeReport report;
  const ReportDetailScreen({super.key, required this.report});

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd MMMM yyyy, hh:mm a', 'bn');

    return Scaffold(
      appBar: AppBar(title: const Text('রিপোর্টের বিবরণ')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: AspectRatio(
              aspectRatio: 4 / 3,
              child: Image.network(
                ApiService.photoFullUrl(report.photoUrl),
                fit: BoxFit.cover,
                errorBuilder: (c, e, s) => Container(
                  color: AppColors.asphaltLight,
                  child: const Icon(Icons.image_not_supported_outlined, size: 48, color: AppColors.textMuted),
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              SeverityBadge(severity: report.severity),
              StatusBadge(status: report.status),
            ],
          ),
          const SizedBox(height: 16),
          _InfoRow(icon: Icons.location_on_outlined, label: 'অবস্থান', value: '${report.divisionName ?? "অজানা এলাকা"}${report.placeNote != null ? " — ${report.placeNote}" : ""}'),
          _InfoRow(icon: Icons.pin_drop_outlined, label: 'স্থানাঙ্ক', value: '${report.lat.toStringAsFixed(5)}, ${report.lng.toStringAsFixed(5)}'),
          _InfoRow(icon: Icons.route_outlined, label: 'রাস্তার ধরন', value: report.roadTypeLabel),
          _InfoRow(icon: Icons.account_balance_outlined, label: 'দায়িত্বপ্রাপ্ত কর্তৃপক্ষ', value: report.authorityName),
          _InfoRow(icon: Icons.access_time, label: 'জমা দেওয়ার সময়', value: dateFmt.format(report.createdAt.toLocal())),
          if (report.description != null && report.description!.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Text('বিবরণ', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text(report.description!, style: const TextStyle(color: AppColors.textPrimary)),
          ],
          const SizedBox(height: 20),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  const Icon(Icons.info_outline, color: AppColors.textMuted, size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      _statusNote(report.status),
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 12.5),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _statusNote(String status) {
    switch (status) {
      case 'forwarded':
        return 'এই রিপোর্টটি দায়িত্বপ্রাপ্ত কর্তৃপক্ষের কাছে ইমেইলে পাঠানো হয়েছে।';
      case 'queued_for_authority':
        return 'এই রিপোর্টটি কর্তৃপক্ষের কাছে পাঠানোর জন্য সারিবদ্ধ আছে। যাচাইকৃত যোগাযোগ তথ্য যুক্ত হলে এটি স্বয়ংক্রিয়ভাবে পাঠানো হবে।';
      case 'resolved':
        return 'সংশ্লিষ্ট কর্তৃপক্ষ এই সমস্যাটি সমাধান করেছে বলে চিহ্নিত করা হয়েছে।';
      case 'rejected':
        return 'পর্যালোচনার পর এই রিপোর্টটি বাতিল করা হয়েছে।';
      case 'in_progress':
        return 'কর্তৃপক্ষ এই সমস্যা নিয়ে কাজ করছে বলে জানা গেছে।';
      default:
        return 'রিপোর্টটি জমা পড়েছে এবং পর্যালোচনার অপেক্ষায় আছে।';
    }
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppColors.textMuted),
          const SizedBox(width: 10),
          SizedBox(
            width: 110,
            child: Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 12.5)),
          ),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600))),
        ],
      ),
    );
  }
}
