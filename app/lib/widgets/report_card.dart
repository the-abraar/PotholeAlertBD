import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/report.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import 'badges.dart';

class ReportCard extends StatelessWidget {
  final PotholeReport report;
  final VoidCallback? onTap;
  const ReportCard({super.key, required this.report, this.onTap});

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd MMM, hh:mm a', 'bn');
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.network(
                  ApiService.photoFullUrl(report.photoUrl),
                  width: 96,
                  height: 84,
                  fit: BoxFit.cover,
                  errorBuilder: (c, e, s) => Container(
                    width: 96,
                    height: 84,
                    color: AppColors.asphaltLight,
                    child: const Icon(Icons.image_not_supported_outlined, color: AppColors.textMuted),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${report.divisionName ?? "অজানা এলাকা"} · ${report.roadTypeLabel}',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    if (report.placeNote != null && report.placeNote!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          report.placeNote!,
                          style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        SeverityBadge(severity: report.severity),
                        StatusBadge(status: report.status),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      dateFmt.format(report.createdAt.toLocal()),
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 11),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
