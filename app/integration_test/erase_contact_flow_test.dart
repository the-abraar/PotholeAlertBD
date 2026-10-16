// End-to-end check of the erase flow on a simulator or device: real EraseContactScreen and real
// ApiService against a running backend. Not part of scripts/check.sh (needs a device and a backend).
//
// Run: start the backend (`cd backend && npm start`, port 4000), then from app/:
//   flutter test integration_test/erase_contact_flow_test.dart -d <device id>
// Android emulators reach the host at 10.0.2.2 automatically; a real phone needs
// --dart-define=API_BASE_URL=http://<host LAN IP>:4000.
// iOS: the simulator build needs IPHONEOS_DEPLOYMENT_TARGET >= 15.0 on current Xcode (it is 13.0 now).
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:potholealert_app/screens/about_screen.dart';
import 'package:potholealert_app/services/api_service.dart';

// A 4x2 PNG, the smallest photo the backend accepts as a report.
final _png = Uint8List.fromList([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x02, 0x08, 0x02, 0x00, 0x00, 0x00, 0xf0, 0xca, 0xea,
  0x34, 0x00, 0x00, 0x00, 0x09, 0x70, 0x48, 0x59, 0x73, 0x00, 0x00, 0x03, 0xe8, 0x00, 0x00, 0x03,
  0xe8, 0x01, 0xb5, 0x7b, 0x52, 0x6b, 0x00, 0x00, 0x00, 0x0e, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99,
  0x63, 0xe8, 0x40, 0x02, 0x0c, 0xc8, 0x1c, 0x00, 0xa5, 0xda, 0x0c, 0xc1, 0x3b, 0xcb, 0xa5, 0x56,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

Future<void> waitFor(WidgetTester t, Finder f) async {
  for (var i = 0; i < 100 && f.evaluate().isEmpty; i++) {
    await t.pump(const Duration(milliseconds: 100));
  }
  expect(f, findsOneWidget);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('About -> erase screen -> paste copied text -> erased', (tester) async {
    final r = await ApiService.submitReport(
      photoBytes: _png, photoFilename: 'a.png', lat: 23.70, lng: 90.40,
      roadType: 'city_road', severity: 'low', contactName: 'Sim Reporter', contactPhone: '01800000000',
    );
    await tester.pumpWidget(const MaterialApp(home: AboutScreen()));
    final link = find.textContaining('Erase my contact details');
    await tester.scrollUntilVisible(link, 200);
    await tester.tap(link);
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextFormField).first, 'Report ID: ${r.id}\nDeletion code: wrong');
    await tester.tap(find.text('মুছে ফেলুন / Erase'));
    await waitFor(tester, find.textContaining('does not match'));

    await tester.enterText(find.byType(TextFormField).first, 'Report ID: ${r.id}\nDeletion code: ${r.deletionCode}');
    await tester.tap(find.text('মুছে ফেলুন / Erase'));
    await waitFor(tester, find.textContaining('were erased'));
  });
}
