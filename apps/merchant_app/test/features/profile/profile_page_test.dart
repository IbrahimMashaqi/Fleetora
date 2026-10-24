import 'package:fleetora_merchant/features/profile/profile_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../accounting/finance_test_support.dart';

void main() {
  testWidgets(
    'profile shows trusted merchant/company contact information read only',
    (tester) async {
      await tester.pumpWidget(testPage(const ProfilePage(), AccountApiFake()));
      await tester.pumpAndSettle();
      expect(find.text('Olive shop'), findsOneWidget);
      expect(find.text('Delivery company'), findsNWidgets(2));
      expect(find.text('0591234567'), findsOneWidget);
      expect(find.text('Market street'), findsOneWidget);
      expect(find.text('Merchant employee'), findsOneWidget);
      expect(find.byType(TextFormField), findsNothing);
      expect(find.text('Employees and invitations'), findsNothing);
    },
  );
}
