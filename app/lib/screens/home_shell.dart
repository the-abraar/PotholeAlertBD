import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'about_screen.dart';
import 'feed_screen.dart';
import 'map_screen.dart';
import 'report_form_screen.dart';
import 'stats_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  static const _titles = ['ফিড', 'মানচিত্র', 'পরিসংখ্যান'];
  static const _screens = [FeedScreen(), MapScreen(), StatsScreen()];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Icon(Icons.warning_amber_rounded, color: AppColors.amber),
            const SizedBox(width: 8),
            Text('PotholeAlertBD · ${_titles[_index]}'),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'সম্পর্কে',
            icon: const Icon(Icons.info_outline),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const AboutScreen()),
            ),
          ),
        ],
      ),
      body: IndexedStack(index: _index, children: _screens),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const ReportFormScreen()),
        ),
        icon: const Icon(Icons.add_a_photo_outlined),
        label: const Text('রিপোর্ট করুন'),
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.list_alt_outlined), label: 'ফিড'),
          BottomNavigationBarItem(icon: Icon(Icons.map_outlined), label: 'মানচিত্র'),
          BottomNavigationBarItem(icon: Icon(Icons.bar_chart_outlined), label: 'পরিসংখ্যান'),
        ],
      ),
    );
  }
}
