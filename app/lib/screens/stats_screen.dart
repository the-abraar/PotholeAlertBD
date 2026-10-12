import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../theme/app_theme.dart';

class StatsScreen extends StatefulWidget {
  const StatsScreen({super.key});

  @override
  State<StatsScreen> createState() => _StatsScreenState();
}

class _StatsScreenState extends State<StatsScreen> {
  Map<String, dynamic>? _stats;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ApiService.fetchStats();
      setState(() => _stats = data);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _stats == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('পরিসংখ্যান লোড করা যায়নি।\n$_error', textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textMuted)),
              const SizedBox(height: 12),
              OutlinedButton(onPressed: _load, child: const Text('আবার চেষ্টা করুন')),
            ],
          ),
        ),
      );
    }

    final s = _stats!;
    final byDivision = (s['byDivision'] as List).cast<Map<String, dynamic>>();
    final maxCount = byDivision.fold<int>(1, (m, d) => (d['count'] as int) > m ? d['count'] as int : m);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
        children: [
          Row(
            children: [
              _StatTile(label: 'মোট রিপোর্ট', value: '${s['total']}'),
              const SizedBox(width: 12),
              _StatTile(label: 'সমাধান হয়েছে', value: '${s['resolvedRate']}%'),
              const SizedBox(width: 12),
              _StatTile(label: 'কর্তৃপক্ষকে জানানো', value: '${s['forwarded']}'),
            ],
          ),
          const SizedBox(height: 24),
          const Text('বিভাগ অনুযায়ী রিপোর্ট', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 4),
          const Text(
            'ghush.site-এর ধাঁচে — একটি ঘটনা শুধুই একটি অভিযোগ, কিন্তু অনেক রেকর্ড রাস্তার সমস্যার প্রকৃত চিত্র তুলে ধরে।',
            style: TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 16),
          ...byDivision.map((d) => _DivisionBar(
                name: d['name'] as String,
                count: d['count'] as int,
                maxCount: maxCount,
              )),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  const _StatTile({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
          child: Column(
            children: [
              Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.amber)),
              const SizedBox(height: 4),
              Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
            ],
          ),
        ),
      ),
    );
  }
}

class _DivisionBar extends StatelessWidget {
  final String name;
  final int count;
  final int maxCount;
  const _DivisionBar({required this.name, required this.count, required this.maxCount});

  @override
  Widget build(BuildContext context) {
    final fraction = maxCount == 0 ? 0.0 : count / maxCount;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
              Text('$count', style: const TextStyle(color: AppColors.textMuted)),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: fraction,
              minHeight: 8,
              backgroundColor: AppColors.asphaltLight,
              valueColor: const AlwaysStoppedAnimation(AppColors.amber),
            ),
          ),
        ],
      ),
    );
  }
}
