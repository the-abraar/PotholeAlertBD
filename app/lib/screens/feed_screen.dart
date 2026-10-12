import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/report.dart';
import '../services/reports_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/report_card.dart';
import 'report_detail_screen.dart';

class FeedScreen extends StatefulWidget {
  const FeedScreen({super.key});

  @override
  State<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends State<FeedScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ReportsProvider>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ReportsProvider>();

    return RefreshIndicator(
      onRefresh: provider.load,
      child: Column(
        children: [
          _FilterBar(provider: provider),
          Expanded(
            child: Builder(builder: (context) {
              if (provider.loading && provider.reports.isEmpty) {
                return const Center(child: CircularProgressIndicator());
              }
              if (provider.error != null) {
                return _ErrorState(message: provider.error!, onRetry: provider.load);
              }
              if (provider.reports.isEmpty) {
                return ListView(
                  children: const [
                    SizedBox(height: 80),
                    Center(
                      child: Text(
                        'এখনো কোনো রিপোর্ট নেই।\nপ্রথম রিপোর্টটি আপনি দিন!',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.textMuted),
                      ),
                    ),
                  ],
                );
              }
              return ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 90),
                itemCount: provider.reports.length,
                itemBuilder: (context, i) {
                  final r = provider.reports[i];
                  return ReportCard(
                    report: r,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(builder: (_) => ReportDetailScreen(report: r)),
                    ),
                  );
                },
              );
            }),
          ),
        ],
      ),
    );
  }
}

class _FilterBar extends StatelessWidget {
  final ReportsProvider provider;
  const _FilterBar({required this.provider});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            _DropdownChip<String>(
              label: 'বিভাগ',
              value: provider.divisionFilter,
              items: kDivisionNames.entries.map((e) => MapEntry(e.key, e.value)).toList(),
              onChanged: (v) => provider.setFilters(
                division: v,
                roadType: provider.roadTypeFilter,
                status: provider.statusFilter,
              ),
            ),
            const SizedBox(width: 8),
            _DropdownChip<String>(
              label: 'রাস্তার ধরন',
              value: provider.roadTypeFilter,
              items: kRoadTypes,
              onChanged: (v) => provider.setFilters(
                division: provider.divisionFilter,
                roadType: v,
                status: provider.statusFilter,
              ),
            ),
            const SizedBox(width: 8),
            _DropdownChip<String>(
              label: 'স্ট্যাটাস',
              value: provider.statusFilter,
              items: kStatusLabels.entries.map((e) => MapEntry(e.key, e.value)).toList(),
              onChanged: (v) => provider.setFilters(
                division: provider.divisionFilter,
                roadType: provider.roadTypeFilter,
                status: v,
              ),
            ),
            if (provider.divisionFilter != null || provider.roadTypeFilter != null || provider.statusFilter != null) ...[
              const SizedBox(width: 8),
              ActionChip(
                label: const Text('ফিল্টার মুছুন'),
                avatar: const Icon(Icons.close, size: 16),
                onPressed: provider.clearFilters,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DropdownChip<T> extends StatelessWidget {
  final String label;
  final T? value;
  final List<MapEntry<T, String>> items;
  final ValueChanged<T?> onChanged;

  const _DropdownChip({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final selectedLabel = value == null
        ? label
        : items.firstWhere((e) => e.key == value, orElse: () => MapEntry(value as T, label)).value;

    return PopupMenuButton<T?>(
      initialValue: value,
      onSelected: onChanged,
      itemBuilder: (context) => [
        PopupMenuItem<T?>(value: null, child: Text('সব $label')),
        ...items.map((e) => PopupMenuItem<T?>(value: e.key, child: Text(e.value))),
      ],
      child: Chip(
        label: Text(selectedLabel, overflow: TextOverflow.ellipsis),
        avatar: const Icon(Icons.filter_list, size: 16),
        backgroundColor: value != null ? AppColors.amber.withValues(alpha: 0.18) : null,
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, color: AppColors.textMuted, size: 40),
            const SizedBox(height: 12),
            Text(
              'সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না।\n$message',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textMuted),
            ),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onRetry, child: const Text('আবার চেষ্টা করুন')),
          ],
        ),
      ),
    );
  }
}
