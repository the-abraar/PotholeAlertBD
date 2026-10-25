// সম্মতি ডায়ালগ ও ডুপ্লিকেট-রিপোর্ট ডায়ালগের উইজেট টেস্ট।

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'package:potholealert_app/models/report.dart';

import 'package:potholealert_app/screens/report_detail_screen.dart';
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

  group('navigation after submit', () {
    PotholeReport report({String? code}) => PotholeReport.fromJson({
          'id': 'r-1', 'photoUrl': '/uploads/x.png', 'lat': 23.8, 'lng': 90.4, 'roadType': 'city_road',
          'roadTypeLabel': 'City road', 'severity': 'medium', 'authorityName': 'X', 'status': 'new',
          'createdAt': '2026-10-15T00:00:00.000Z', 'updatedAt': '2026-10-15T00:00:00.000Z',
          'deletionCode': ?code,
        });

    /// Home screen with a button that pushes a stand-in form route, whose button calls [finishSubmit].
    Future<void> pumpForm(WidgetTester tester, PotholeReport r, {required bool hadContact}) async {
      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (home) => Scaffold(
            body: Column(children: [
              const Text('home'),
              ElevatedButton(
                onPressed: () => Navigator.of(home).push(MaterialPageRoute(
                  builder: (_) => Scaffold(
                    body: Builder(
                      builder: (form) => ElevatedButton(
                        onPressed: () => finishSubmit(form, r, hadContact: hadContact),
                        child: const Text('submit'),
                      ),
                    ),
                  ),
                )),
                child: const Text('open form'),
              ),
            ]),
          ),
        ),
      ));
      await tester.tap(find.text('open form'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('submit'));
      await tester.pumpAndSettle();
    }

    testWidgets('form stays open behind the code dialog, Done closes it and thanks the reporter', (tester) async {
      await pumpForm(tester, report(code: 'abc123'), hadContact: true);
      expect(find.text('Report ID: r-1\nDeletion code: abc123'), findsOneWidget);
      expect(find.text('submit', skipOffstage: false), findsOneWidget); // form route still under the dialog

      await tester.tap(find.textContaining('Done'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Deletion code'), findsNothing);
      expect(find.text('submit', skipOffstage: false), findsNothing); // form popped
      expect(find.text('home'), findsOneWidget);
      expect(find.textContaining('ধন্যবাদ'), findsOneWidget); // snackbar survives the pop
    });

    for (final (name, code, hadContact) in [('anonymous report', 'abc123', false), ('no code returned', null, true)]) {
      testWidgets('$name: no dialog, the form closes straight away', (tester) async {
        await pumpForm(tester, report(code: code), hadContact: hadContact);
        expect(find.textContaining('Deletion code'), findsNothing);
        expect(find.text('submit', skipOffstage: false), findsNothing);
        expect(find.text('home'), findsOneWidget);
        expect(find.textContaining('ধন্যবাদ'), findsOneWidget);
      });
    }
  });

  group('navigation after the duplicate dialog', () {
    final existing = PotholeReport.fromJson({
      'id': 'r-9', 'photoUrl': '/uploads/x.png', 'lat': 23.8, 'lng': 90.4, 'roadType': 'city_road',
      'roadTypeLabel': 'City road', 'severity': 'medium', 'authorityName': 'X', 'status': 'new',
      'createdAt': '2026-10-15T00:00:00.000Z', 'updatedAt': '2026-10-15T00:00:00.000Z', 'duplicate': true,
    });

    // Home pushes a stand-in form route whose button calls [handleDuplicate], as the real form does.
    Future<void> pumpDuplicate(WidgetTester tester, String choice) async {
      await initializeDateFormatting('bn');
      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (home) => Scaffold(
            body: Column(children: [
              const Text('home'),
              ElevatedButton(
                onPressed: () => Navigator.of(home).push(MaterialPageRoute(
                  builder: (_) => Scaffold(
                    body: Builder(
                      builder: (form) => ElevatedButton(
                        onPressed: () => handleDuplicate(form, existing),
                        child: const Text('submit'),
                      ),
                    ),
                  ),
                )),
                child: const Text('open form'),
              ),
            ]),
          ),
        ),
      ));
      await tester.tap(find.text('open form'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('submit'));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining(choice));
      await tester.pumpAndSettle();
    }

    testWidgets('"View it" replaces the form with the existing report detail', (tester) async {
      await pumpDuplicate(tester, 'View it');
      expect(find.byType(ReportDetailScreen), findsOneWidget);
      expect(tester.widget<ReportDetailScreen>(find.byType(ReportDetailScreen)).report.id, 'r-9');
      expect(find.text('submit', skipOffstage: false), findsNothing); // form popped

      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.text('home'), findsOneWidget); // back goes home, not to the form
    });

    testWidgets('OK just closes the form, no detail screen', (tester) async {
      await pumpDuplicate(tester, 'OK');
      expect(find.byType(ReportDetailScreen), findsNothing);
      expect(find.text('submit', skipOffstage: false), findsNothing);
      expect(find.text('home'), findsOneWidget);
    });
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
