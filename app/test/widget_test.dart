// PotholeAlertBD-এর জন্য মৌলিক স্মোক টেস্ট: অ্যাপ ক্র্যাশ ছাড়া চালু হয় এবং
// প্রধান নেভিগেশন উপাদানগুলো দেখা যায় কিনা তা যাচাই করে।

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:potholealert_app/main.dart';
import 'package:potholealert_app/screens/report_form_screen.dart';

void main() {
  testWidgets('App launches and shows the home shell', (WidgetTester tester) async {
    await tester.pumpWidget(const PotholeAlertApp());
    await tester.pump();

    expect(find.text('রিপোর্ট করুন'), findsOneWidget);
    expect(find.byIcon(Icons.map_outlined), findsOneWidget);
    expect(find.byIcon(Icons.bar_chart_outlined), findsOneWidget);
  });

  test('phone validator: optional, Bangladeshi format when present', () {
    expect(validateBdPhone(''), isNull);
    expect(validateBdPhone(null), isNull);
    expect(validateBdPhone('01712345678'), isNull);
    expect(validateBdPhone('+8801712345678'), isNull);
    expect(validateBdPhone('01 712-345678'), isNull);
    expect(validateBdPhone('0121234567'), isNotNull);
    expect(validateBdPhone('12345'), isNotNull);
  });
}
