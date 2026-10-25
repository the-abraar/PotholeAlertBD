import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:image_picker/image_picker.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/report.dart';
import '../services/api_service.dart';
import '../services/location_service.dart';
import '../services/reports_provider.dart';
import '../theme/app_theme.dart';
import 'map_screen.dart' show kBangladeshCenter;
import 'report_detail_screen.dart';

Future<bool?> showDuplicateDialog(BuildContext context) {
  return showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('কাছাকাছি রিপোর্ট আগেই আছে / Already reported nearby'),
      content: const Text(
        'এই জায়গার কাছে একই ধরনের একটি রিপোর্ট আগেই জমা হয়েছে, তাই নতুন রিপোর্ট আলাদাভাবে সংরক্ষণ করা হয়নি।\n\n'
        'A report for this spot already exists nearby, so yours was not saved as a new one.',
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('ঠিক আছে / OK'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('বিদ্যমান রিপোর্ট দেখুন / View it'),
        ),
      ],
    ),
  );
}

Future<bool?> showContactConsentDialog(BuildContext context) {
  return showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('ফোন নম্বর ও গোপনীয়তা / Phone number & privacy'),
      content: const SingleChildScrollView(
        child: Text(
          'কী সংরক্ষণ হবে: আপনার দেওয়া নাম ও ফোন নম্বর।\n'
          'কে দেখবে: শুধু অ্যাডমিন, ফলো-আপের জন্য। জনসমক্ষে দেখানো হয় না।\n'
          'এটি সম্পূর্ণ ঐচ্ছিক; না দিলেও রিপোর্ট জমা দেওয়া যাবে।\n\n'
          'What is stored: the name and phone number you enter.\n'
          'Who sees it: administrators only, to follow up. It is never shown publicly.\n'
          'It is entirely optional; you can submit without it.',
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => launchUrl(
            Uri.parse(ApiService.privacyUrl),
            mode: LaunchMode.externalApplication,
          ),
          child: const Text('গোপনীয়তা নীতি / Privacy policy'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          child: const Text('না / No'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: const Text('সম্মত / I agree'),
        ),
      ],
    ),
  );
}

Future<void> showDeletionCodeDialog(
  BuildContext context, {
  required String reportId,
  required String code,
}) {
  final text = 'Report ID: $reportId\nDeletion code: $code';
  return showDialog<void>(
    context: context,
    barrierDismissible: false, // shown once; make the reporter acknowledge it
    builder: (ctx) => AlertDialog(
      title: const Text('মুছে ফেলার কোড / Deletion code'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'রিপোর্ট আইডি ও এই কোড সংরক্ষণ করুন। এগুলো দিয়ে এই রিপোর্ট থেকে আপনার নাম ও ফোন নম্বর '
              'সঙ্গে সঙ্গে মুছে ফেলা যায়: "সম্পর্কে" পাতার "আমার নাম ও ফোন মুছুন" বোতাম ব্যবহার করুন। কোডটি আর দেখানো হবে না, '
              'হারালে পুনরুদ্ধার করা যায় না। কাউকে দেবেন না।\n\n'
              'Save the report ID and this code. With them you can erase your name and phone number '
              'from this report at once: use "Erase my contact details" on the About screen. The code is shown only once '
              'and cannot be recovered. Do not share it.',
            ),
            const SizedBox(height: 12),
            SelectableText(text, style: const TextStyle(fontFamily: 'monospace')),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => launchUrl(
            Uri.parse(ApiService.privacyUrl),
            mode: LaunchMode.externalApplication,
          ),
          child: const Text('গোপনীয়তা নীতি / Privacy policy'),
        ),
        TextButton.icon(
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: text));
            if (ctx.mounted) {
              ScaffoldMessenger.of(ctx).showSnackBar(
                const SnackBar(content: Text('কপি হয়েছে / Copied')),
              );
            }
          },
          icon: const Icon(Icons.copy),
          label: const Text('কপি / Copy'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('সংরক্ষণ করেছি / Done'),
        ),
      ],
    ),
  );
}

/// After a new (non-duplicate) report: show the one-time deletion code when the reporter gave a name or phone,
/// then thank them and close the form. The code only erases contact fields, so anonymous reporters are not shown it.
Future<void> finishSubmit(BuildContext context, PotholeReport report, {required bool hadContact}) async {
  final code = report.deletionCode;
  if (code != null && hadContact) {
    await showDeletionCodeDialog(context, reportId: report.id, code: code);
    if (!context.mounted) return;
  }
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(content: Text('ধন্যবাদ! আপনার রিপোর্ট জমা হয়েছে।')),
  );
  Navigator.of(context).pop();
}

/// After a duplicate hit: close the form, and open the existing report if the reporter chose "View it".
Future<void> handleDuplicate(BuildContext context, PotholeReport existing) async {
  final nav = Navigator.of(context);
  final view = await showDuplicateDialog(context);
  if (!context.mounted) return;
  nav.pop();
  if (view == true) {
    nav.push(MaterialPageRoute(builder: (_) => ReportDetailScreen(report: existing)));
  }
}

/// Bangladeshi mobile: 01[3-9]xxxxxxxx, optionally with +88 / 88 prefix.
final RegExp kBdPhone = RegExp(r'^(?:\+?88)?01[3-9]\d{8}$');

String? validateBdPhone(String? v) {
  final t = (v ?? '').trim().replaceAll(RegExp(r'[\s-]'), '');
  if (t.isEmpty || kBdPhone.hasMatch(t)) return null;
  return 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন (যেমন 01712345678) / Enter a valid Bangladeshi mobile number';
}

class ReportFormScreen extends StatefulWidget {
  const ReportFormScreen({super.key});

  @override
  State<ReportFormScreen> createState() => _ReportFormScreenState();
}

class _ReportFormScreenState extends State<ReportFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _placeNoteCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();
  final _contactNameCtrl = TextEditingController();
  final _contactPhoneCtrl = TextEditingController();
  final MapController _mapController = MapController();

  Uint8List? _photoBytes;
  String? _photoName;

  LatLng? _location;
  bool _locating = false;
  String? _locationError;

  String _roadType = kRoadTypes.first.key;
  String _severity = 'medium';
  bool _submitting = false;
  bool _contactConsent = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _detectLocation());
  }

  @override
  void dispose() {
    _placeNoteCtrl.dispose();
    _descriptionCtrl.dispose();
    _contactNameCtrl.dispose();
    _contactPhoneCtrl.dispose();
    super.dispose();
  }

  Future<void> _detectLocation() async {
    setState(() {
      _locating = true;
      _locationError = null;
    });
    try {
      final result = await LocationService.getCurrentLocation();
      setState(() => _location = LatLng(result.lat, result.lng));
      _mapController.move(_location!, 15);
    } on LocationException catch (e) {
      setState(() => _locationError = e.toString());
    } catch (e) {
      setState(() => _locationError = 'অবস্থান নির্ণয় করা যায়নি।');
    } finally {
      setState(() => _locating = false);
    }
  }

  Future<void> _pickPhoto(ImageSource source) async {
    final picker = ImagePicker();
    final xfile = await picker.pickImage(
      source: source,
      maxWidth: 1600,
      imageQuality: 85,
    );
    if (xfile == null) return;
    final bytes = await xfile.readAsBytes();
    setState(() {
      _photoBytes = bytes;
      _photoName = xfile.name;
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_photoBytes == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('গর্তের একটি ছবি যুক্ত করুন')),
      );
      return;
    }
    if (_location == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('অবস্থান নির্বাচন করুন')));
      return;
    }

    final contactName = _contactConsent ? _contactNameCtrl.text.trim() : '';
    final contactPhone = _contactConsent
        ? _contactPhoneCtrl.text.trim().replaceAll(RegExp(r'[\s-]'), '')
        : '';
    setState(() => _submitting = true);
    try {
      final report = await ApiService.submitReport(
        photoBytes: _photoBytes!,
        photoFilename: _photoName ?? 'photo.jpg',
        lat: _location!.latitude,
        lng: _location!.longitude,
        roadType: _roadType,
        severity: _severity,
        description: _descriptionCtrl.text.trim(),
        placeNote: _placeNoteCtrl.text.trim(),
        contactName: contactName,
        contactPhone: contactPhone,
      );
      if (!mounted) return;
      context.read<ReportsProvider>().load();
      if (report.duplicate) {
        await _showDuplicate(report);
        return;
      }
      await finishSubmit(context, report, hadContact: contactName.isNotEmpty || contactPhone.isNotEmpty);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _showDuplicate(PotholeReport existing) => handleDuplicate(context, existing);

  Future<void> _askContactConsent() async {
    final ok = await showContactConsentDialog(context);
    if (ok == true) setState(() => _contactConsent = true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('নতুন গর্তের রিপোর্ট')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            const Text(
              'আপনার নাম-পরিচয় ছাড়াই রিপোর্ট জমা দেওয়া যায়। শুধু ছবি ও অবস্থান দিলেই চলবে।',
              style: TextStyle(color: AppColors.textMuted, fontSize: 12.5),
            ),
            const SizedBox(height: 16),
            _SectionLabel('গর্তের ছবি *'),
            _PhotoPicker(photoBytes: _photoBytes, onPick: _pickPhoto),
            const SizedBox(height: 20),
            _SectionLabel('অবস্থান *'),
            _LocationPicker(
              location: _location,
              locating: _locating,
              error: _locationError,
              mapController: _mapController,
              onRefresh: _detectLocation,
              onMapTap: (p) => setState(() => _location = p),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _placeNoteCtrl,
              decoration: const InputDecoration(
                labelText: 'স্থান/এলাকার নাম (ঐচ্ছিক)',
                hintText: 'যেমন: মিরপুর রোড ১০, ঢাকা',
              ),
            ),
            const SizedBox(height: 20),
            _SectionLabel('রাস্তার ধরন *'),
            _ChipSelector(
              options: kRoadTypes,
              selected: _roadType,
              onSelected: (v) => setState(() => _roadType = v),
            ),
            const SizedBox(height: 20),
            _SectionLabel('তীব্রতা *'),
            _ChipSelector(
              options: kSeverities,
              selected: _severity,
              onSelected: (v) => setState(() => _severity = v),
            ),
            const SizedBox(height: 20),
            _SectionLabel('বিবরণ (ঐচ্ছিক)'),
            TextFormField(
              controller: _descriptionCtrl,
              maxLines: 3,
              decoration: const InputDecoration(
                hintText: 'গর্তের আকার, ঝুঁকি বা অন্য তথ্য লিখুন...',
              ),
            ),
            const SizedBox(height: 20),
            _SectionLabel('যোগাযোগ (সম্পূর্ণ ঐচ্ছিক, প্রকাশ করা হবে না)'),
            if (!_contactConsent)
              OutlinedButton(
                onPressed: _askContactConsent,
                child: const Text(
                  'যোগাযোগের তথ্য দিতে চান? / Add contact details (optional)',
                ),
              )
            else ...[
              TextFormField(
                controller: _contactNameCtrl,
                decoration: const InputDecoration(labelText: 'নাম (ঐচ্ছিক)'),
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _contactPhoneCtrl,
                keyboardType: TextInputType.phone,
                validator: validateBdPhone,
                decoration: const InputDecoration(
                  labelText: 'ফোন নম্বর (ঐচ্ছিক) / Phone (optional)',
                ),
              ),
            ],
            const SizedBox(height: 28),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('রিপোর্ট জমা দিন'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(text, style: const TextStyle(fontWeight: FontWeight.w700)),
    );
  }
}

class _PhotoPicker extends StatelessWidget {
  final Uint8List? photoBytes;
  final Future<void> Function(ImageSource) onPick;
  const _PhotoPicker({required this.photoBytes, required this.onPick});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (photoBytes != null)
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.memory(
              photoBytes!,
              height: 180,
              width: double.infinity,
              fit: BoxFit.cover,
            ),
          )
        else
          Container(
            height: 140,
            width: double.infinity,
            decoration: BoxDecoration(
              color: AppColors.asphaltLight,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.border),
            ),
            child: const Center(
              child: Icon(
                Icons.add_a_photo_outlined,
                color: AppColors.textMuted,
                size: 36,
              ),
            ),
          ),
        const SizedBox(height: 10),
        Row(
          children: [
            if (!kIsWeb)
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => onPick(ImageSource.camera),
                  icon: const Icon(Icons.camera_alt_outlined, size: 18),
                  label: const Text('ক্যামেরা'),
                ),
              ),
            if (!kIsWeb) const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => onPick(ImageSource.gallery),
                icon: const Icon(Icons.photo_library_outlined, size: 18),
                label: Text(kIsWeb ? 'ছবি নির্বাচন করুন' : 'গ্যালারি'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _LocationPicker extends StatelessWidget {
  final LatLng? location;
  final bool locating;
  final String? error;
  final MapController mapController;
  final VoidCallback onRefresh;
  final ValueChanged<LatLng> onMapTap;

  const _LocationPicker({
    required this.location,
    required this.locating,
    required this.error,
    required this.mapController,
    required this.onRefresh,
    required this.onMapTap,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            height: 200,
            child: Stack(
              children: [
                FlutterMap(
                  mapController: mapController,
                  options: MapOptions(
                    initialCenter: location ?? kBangladeshCenter,
                    initialZoom: location != null ? 15 : 6.4,
                    onTap: (tapPos, point) => onMapTap(point),
                  ),
                  children: [
                    TileLayer(
                      urlTemplate:
                          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.potholealertbd.app',
                    ),
                    if (location != null)
                      MarkerLayer(
                        markers: [
                          Marker(
                            point: location!,
                            width: 34,
                            height: 34,
                            child: const Icon(
                              Icons.location_on,
                              color: AppColors.amber,
                              size: 34,
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
                Positioned(
                  bottom: 8,
                  right: 8,
                  child: FloatingActionButton.small(
                    heroTag: 'gpsRefresh',
                    onPressed: locating ? null : onRefresh,
                    backgroundColor: AppColors.card,
                    foregroundColor: AppColors.amber,
                    child: locating
                        ? const SizedBox(
                            height: 16,
                            width: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.my_location),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          location != null
              ? 'স্থানাঙ্ক: ${location!.latitude.toStringAsFixed(5)}, ${location!.longitude.toStringAsFixed(5)} (মানচিত্রে ট্যাপ করে ঠিক করুন)'
              : (error ?? 'অবস্থান নির্ণয় করা হচ্ছে...'),
          style: TextStyle(
            fontSize: 12,
            color: error != null ? AppColors.danger : AppColors.textMuted,
          ),
        ),
      ],
    );
  }
}

class _ChipSelector extends StatelessWidget {
  final List<MapEntry<String, String>> options;
  final String selected;
  final ValueChanged<String> onSelected;

  const _ChipSelector({
    required this.options,
    required this.selected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: options.map((o) {
        final isSelected = o.key == selected;
        return ChoiceChip(
          label: Text(o.value),
          selected: isSelected,
          selectedColor: AppColors.amber.withValues(alpha: 0.22),
          onSelected: (_) => onSelected(o.key),
        );
      }).toList(),
    );
  }
}
