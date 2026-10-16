import 'package:flutter/material.dart';

import '../services/api_service.dart';

/// Splits the text the deletion-code dialog copies ("Report ID: …\nDeletion code: …") into its two parts,
/// so a reporter can paste it whole into the first field. Returns null when [text] is not that format.
({String id, String code})? parseCopiedDeletionText(String text) {
  // A single-line field drops the newline on paste, so the ID ends at "Deletion code:", not at whitespace.
  final m = RegExp(r'Report ID:\s*(\S+?)\s*Deletion code:\s*(\S+)').firstMatch(text);
  return m == null ? null : (id: m.group(1)!, code: m.group(2)!);
}

typedef EraseContact = Future<void> Function({required String reportId, required String code});

Future<void> _eraseViaApi({required String reportId, required String code}) =>
    ApiService.eraseContact(reportId: reportId, code: code);

/// Erase a reporter's name and phone from one report with the report ID and one-time code shown after submitting.
/// Nothing is stored on the phone: the reporter keeps the code (the dialog has a copy button).
class EraseContactScreen extends StatefulWidget {
  const EraseContactScreen({super.key, this.erase = _eraseViaApi});

  final EraseContact erase;

  @override
  State<EraseContactScreen> createState() => _EraseContactScreenState();
}

class _EraseContactScreenState extends State<EraseContactScreen> {
  final _formKey = GlobalKey<FormState>();
  final _id = TextEditingController();
  final _code = TextEditingController();
  bool _busy = false;
  String? _message;
  bool _ok = false;

  @override
  void dispose() {
    _id.dispose();
    _code.dispose();
    super.dispose();
  }

  void _maybeSplitPaste(String text) {
    final parsed = parseCopiedDeletionText(text);
    if (parsed == null) return;
    _id.text = parsed.id;
    _code.text = parsed.code;
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await widget.erase(reportId: _id.text.trim(), code: _code.text.trim());
      if (!mounted) return;
      setState(() {
        _ok = true;
        _message = 'আপনার নাম ও ফোন নম্বর এই রিপোর্ট থেকে মুছে ফেলা হয়েছে। / Your name and phone number were erased from this report.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _ok = false;
        _message = '$e'.replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    String? required(String? v) => (v == null || v.trim().isEmpty) ? 'প্রয়োজন / Required' : null;
    return Scaffold(
      appBar: AppBar(title: const Text('নাম ও ফোন মুছুন')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              'রিপোর্ট জমার পর দেখানো রিপোর্ট আইডি ও মুছে ফেলার কোড দিন। রিপোর্ট ও ছবি থাকবে; শুধু আপনার নাম ও ফোন মুছে যাবে।\n\n'
              'Enter the report ID and deletion code shown after you submitted. The report and photo stay; only your name and phone are erased.',
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _id,
              decoration: const InputDecoration(labelText: 'রিপোর্ট আইডি / Report ID'),
              autocorrect: false,
              enableSuggestions: false,
              validator: required,
              onChanged: _maybeSplitPaste,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _code,
              decoration: const InputDecoration(labelText: 'মুছে ফেলার কোড / Deletion code'),
              autocorrect: false, // keyboards must not "fix" a hex code
              enableSuggestions: false,
              validator: required,
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _busy || _ok ? null : _submit,
              child: Text(_busy ? 'মুছে ফেলা হচ্ছে... / Erasing...' : 'মুছে ফেলুন / Erase'),
            ),
            if (_message != null) ...[
              const SizedBox(height: 16),
              // liveRegion: screen readers announce the result without the user hunting for it.
              Semantics(
                liveRegion: true,
                child: Text(_message!, style: TextStyle(color: _ok ? Colors.green.shade800 : Theme.of(context).colorScheme.error)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
