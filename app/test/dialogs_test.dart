// সম্মতি ডায়ালগ ও ডুপ্লিকেট-রিপোর্ট ডায়ালগের উইজেট টেস্ট।

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

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
}
