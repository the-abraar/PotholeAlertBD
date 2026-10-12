import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';

import '../models/report.dart';
import '../services/reports_provider.dart';
import '../theme/app_theme.dart';
import 'report_detail_screen.dart';

/// বাংলাদেশের কেন্দ্রবিন্দু — মানচিত্র শুরুতে এখানেই ফোকাস করে।
const LatLng kBangladeshCenter = LatLng(23.8, 90.35);

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final MapController _controller = MapController();

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
    final reports = provider.reports;

    return Stack(
      children: [
        FlutterMap(
          mapController: _controller,
          options: const MapOptions(
            initialCenter: kBangladeshCenter,
            initialZoom: 6.4,
            minZoom: 5,
            maxZoom: 18,
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.potholealertbd.app',
            ),
            MarkerLayer(
              markers: reports.map((r) => _buildMarker(context, r)).toList(),
            ),
          ],
        ),
        if (provider.loading)
          const Positioned(
            top: 12,
            right: 12,
            child: _Chip(child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))),
          ),
        Positioned(
          top: 12,
          left: 12,
          child: _Chip(
            child: Text('মোট: ${reports.length} টি রিপোর্ট', style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
        ),
        Positioned(
          bottom: 16,
          right: 12,
          child: FloatingActionButton.small(
            heroTag: 'recenter',
            backgroundColor: AppColors.card,
            foregroundColor: AppColors.amber,
            onPressed: () => _controller.move(kBangladeshCenter, 6.4),
            child: const Icon(Icons.center_focus_strong),
          ),
        ),
      ],
    );
  }

  Marker _buildMarker(BuildContext context, PotholeReport r) {
    final color = severityColor(r.severity);
    return Marker(
      point: LatLng(r.lat, r.lng),
      width: 34,
      height: 34,
      child: GestureDetector(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => ReportDetailScreen(report: r)),
        ),
        child: Container(
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.85),
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: [BoxShadow(color: color.withValues(alpha: 0.5), blurRadius: 6)],
          ),
          child: const Icon(Icons.warning_rounded, color: Colors.white, size: 18),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  final Widget child;
  const _Chip({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.card.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: child,
    );
  }
}
