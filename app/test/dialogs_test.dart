// সম্মতি ডায়ালগ ও ডুপ্লিকেট-রিপোর্ট ডায়ালগের উইজেট টেস্ট।

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:potholealert_app/models/report.dart';

import 'package:potholealert_app/screens/report_form_screen.dart';

/// Opens [open] from a button and returns a getter for the dialog result.
Future<bool? Function()> _pumpDialog(WidgetTester tester, Future<bool?> Function(BuildContext) open) async {
  bool? result;
  var done = false;
  await tester.pumpWidget(MaterialApp(
    home: Builder(
      builder: (ctx) => ElevatedButton(
        onPressed: () async {
          result = await open(ctx);
          done = true;
        },
        child: const Text('open'),
      ),
    ),
  ));
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return () {
    expect(done, isTrue);
    return result;
  };
}

void main() {
  testWidgets('consent dialog explains privacy and returns true on agree', (tester) async {
    final result = await _pumpDialog(tester, showContactConsentDialog);
    expect(find.textContaining('Phone number & privacy'), findsOneWidget);
    expect(find.textContaining('administrators only'), findsOneWidget);
    expect(find.textContaining('Privacy policy'), findsOneWidget);

    await tester.tap(find.textContaining('I agree'));
    await tester.pumpAndSettle();
    expect(result(), isTrue);
  });

  testWidgets('consent dialog returns false on decline', (tester) async {
    final result = await _pumpDialog(tester, showContactConsentDialog);
    await tester.tap(find.textContaining('/ No'));
    await tester.pumpAndSettle();
    expect(result(), isFalse);
  });

  testWidgets('duplicate dialog "View it" returns true', (tester) async {
    final result = await _pumpDialog(tester, showDuplicateDialog);
    expect(find.textContaining('Already reported nearby'), findsOneWidget);

    await tester.tap(find.textContaining('View it'));
    await tester.pumpAndSettle();
    expect(result(), isTrue);
  });

  testWidgets('duplicate dialog OK returns false', (tester) async {
    final result = await _pumpDialog(tester, showDuplicateDialog);
    await tester.tap(find.textContaining('OK'));
    await tester.pumpAndSettle();
    expect(result(), isFalse);
  });

  testWidgets('deletion code dialog shows id and code, explains erasure, copies both', (tester) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));

    var closed = false;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (ctx) => ElevatedButton(
            onPressed: () async {
              await showDeletionCodeDialog(ctx, reportId: 'r-1', code: 'abc123');
              closed = true;
            },
            child: const Text('open'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Deletion code'), findsWidgets);
    expect(find.textContaining('erase your name and phone number'), findsOneWidget);
    expect(find.textContaining('shown only once'), findsOneWidget);
    expect(find.text('Report ID: r-1\nDeletion code: abc123'), findsOneWidget);

    await tester.tap(find.textContaining('Copy'));
    await tester.pump();
    expect(copied, 'Report ID: r-1\nDeletion code: abc123');

    await tester.tapAt(const Offset(5, 5)); // barrier does not dismiss
    await tester.pumpAndSettle();
    expect(closed, isFalse);
    await tester.tap(find.textContaining('Done'));
    await tester.pumpAndSettle();
    expect(closed, isTrue);
  });

  test('deletionCode is read from the backend 201 response field', () {
    final json = {
      'id': 'r-1', 'photoUrl': '/uploads/x.png', 'lat': 23.8, 'lng': 90.4, 'roadType': 'city_road',
      'roadTypeLabel': 'City road', 'severity': 'medium', 'authorityName': 'X', 'status': 'new',
      'createdAt': '2026-10-15T00:00:00.000Z', 'updatedAt': '2026-10-15T00:00:00.000Z', 'deletionCode': 'abc123',
    };
    expect(PotholeReport.fromJson(json).deletionCode, 'abc123');
    expect(PotholeReport.fromJson({...json}..remove('deletionCode')).deletionCode, isNull);
  });
}
