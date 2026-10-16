// নাম ও ফোন মুছে ফেলার পাতা: কপি করা লেখা ভাগ করা, সফল ও ভুল কোড, আর API কল।

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:potholealert_app/screens/erase_contact_screen.dart';
import 'package:potholealert_app/services/api_service.dart';

void main() {
  test('parses the text the deletion-code dialog copies', () {
    final p = parseCopiedDeletionText('Report ID: r-42\nDeletion code: AB12CD34');
    expect(p?.id, 'r-42');
    expect(p?.code, 'AB12CD34');
    final flat = parseCopiedDeletionText('Report ID: r-42Deletion code: AB12CD34'); // pasted into a one-line field
    expect([flat?.id, flat?.code], ['r-42', 'AB12CD34']);
    expect(parseCopiedDeletionText('r-42'), isNull);
  });

  testWidgets('pasting the copied text fills both fields, and a good code shows success', (tester) async {
    String? gotId, gotCode;
    await tester.pumpWidget(MaterialApp(
      home: EraseContactScreen(erase: ({required reportId, required code}) async {
        gotId = reportId;
        gotCode = code;
      }),
    ));
    await tester.enterText(find.byType(TextFormField).first, 'Report ID: r-42\nDeletion code: AB12CD34');
    await tester.tap(find.textContaining('Erase'));
    await tester.pumpAndSettle();
    expect([gotId, gotCode], ['r-42', 'AB12CD34']);
    expect(find.textContaining('were erased'), findsOneWidget);
  });

  testWidgets('empty fields are refused and a wrong code shows the server message', (tester) async {
    var calls = 0;
    await tester.pumpWidget(MaterialApp(
      home: EraseContactScreen(erase: ({required reportId, required code}) async {
        calls++;
        throw Exception('Report ID or code does not match');
      }),
    ));
    await tester.tap(find.textContaining('Erase'));
    await tester.pumpAndSettle();
    expect(calls, 0);
    expect(find.textContaining('Required'), findsNWidgets(2));
    await tester.enterText(find.byType(TextFormField).at(0), 'r-42');
    await tester.enterText(find.byType(TextFormField).at(1), 'WRONG');
    await tester.tap(find.textContaining('Erase'));
    await tester.pumpAndSettle();
    expect(calls, 1);
    expect(find.text('Report ID or code does not match'), findsOneWidget);
  });

  test('eraseContact posts the code as JSON and maps a 403 to a clear error', () async {
    late http.Request sent;
    final ok = MockClient((req) async {
      sent = req;
      return http.Response('{"ok":true}', 200);
    });
    await ApiService.eraseContact(reportId: 'r 42', code: 'AB12', client: ok);
    expect(sent.method, 'POST');
    expect(sent.url.path, '/api/reports/r%2042/erase-contact');
    expect(jsonDecode(sent.body), {'code': 'AB12'});

    final denied = MockClient((_) async => http.Response('{"error":"invalid code"}', 403));
    await expectLater(ApiService.eraseContact(reportId: 'r', code: 'x', client: denied), throwsA(predicate((e) => '$e'.contains('does not match'))));
    final limited = MockClient((_) async => http.Response('{"error":"too many requests"}', 429));
    await expectLater(ApiService.eraseContact(reportId: 'r', code: 'x', client: limited), throwsA(predicate((e) => '$e'.contains('Too many tries'))));
    final offline = MockClient((_) async => throw http.ClientException('Connection refused'));
    await expectLater(ApiService.eraseContact(reportId: 'r', code: 'x', client: offline), throwsA(predicate((e) => '$e'.contains('Could not reach the server'))));
  });
}
