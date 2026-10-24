import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:fleetora_merchant/features/accounting/accounting_page.dart';
import 'package:fleetora_merchant/core/formatting/value_format.dart';
import 'package:fleetora_merchant/features/settlements/settlements_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'finance_test_support.dart';

void main() {
  test('money keeps decimal precision, grouping and negative values', () {
    expect(
      exactMoney('9007199254740993.120', 'USD', 'en'),
      '9,007,199,254,740,993.120 USD',
    );
    expect(exactMoney('-1234.005', 'JOD', 'en'), '-1,234.005 JOD');
    expect(exactMoney('0.00', 'ILS', 'en'), '0.00 ILS');
    expect(exactMoney('1234.50', 'ILS', 'ar'), '١٬٢٣٤٫٥٠ ILS');
    expect(() => exactMoney('NaN', 'USD', 'en'), throwsFormatException);
  });

  testWidgets(
    'denied financial routes never fetch balances or settlement history',
    (tester) async {
      final api = AccountApiFake();
      await tester.pumpWidget(testPage(const AccountingPage(), api));
      await tester.pumpAndSettle();
      expect(
        find.text('Financial access is required to view this page.'),
        findsOneWidget,
      );
      expect(api.statementPages, isEmpty);
      await tester.pumpWidget(
        testPage(
          const SettlementsPage(),
          api,
          permissions: ['SETTLEMENT_REQUEST'],
        ),
      );
      await tester.pumpAndSettle();
      expect(api.statementPages, isEmpty);
      expect(api.settlementPages, isEmpty);
      expect(find.byType(TextFormField), findsNothing);
    },
  );

  testWidgets(
    'financial statement displays separate server balances and pages entries',
    (tester) async {
      final api = AccountApiFake();
      api.statementValue = Statement(
        items: const [
          StatementEntry(
            id: 'entry',
            kind: 'DELIVERY_FEE',
            amount: '-15.00',
            currency: 'USD',
            createdAt: '2026-10-22T10:00:00Z',
          ),
        ],
        balances: api.statementValue.balances,
        page: 1,
        pageSize: 25,
        hasNext: true,
      );
      await tester.pumpWidget(
        testPage(const AccountingPage(), api, permissions: ['FINANCE_VIEW']),
      );
      await tester.pumpAndSettle();
      expect(find.text('9,007,199,254,740,993.12 USD'), findsOneWidget);
      expect(find.text('Eligible for settlement'), findsOneWidget);
      expect(find.text('100.00 USD'), findsOneWidget);
      expect(find.text('Paid'), findsOneWidget);
      expect(find.text('5.00 USD'), findsOneWidget);
      expect(find.text('-15.00 USD'), findsOneWidget);
      await tester.ensureVisible(find.text('Next'));
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();
      expect(api.statementPages, [1, 2]);
    },
  );

  testWidgets('Arabic denial uses RTL and translated copy', (tester) async {
    await tester.pumpWidget(
      testPage(const AccountingPage(), AccountApiFake(), language: 'ar'),
    );
    await tester.pumpAndSettle();
    final text = find.text(
      'تحتاج إلى صلاحية الاطلاع على البيانات المالية لعرض هذه الصفحة.',
    );
    expect(text, findsOneWidget);
    expect(Directionality.of(tester.element(text)), TextDirection.rtl);
  });
}
