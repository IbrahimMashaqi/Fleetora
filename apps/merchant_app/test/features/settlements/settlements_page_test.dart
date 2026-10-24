import 'dart:async';

import 'package:fleetora_merchant/core/authentication/session.dart';
import 'package:fleetora_merchant/core/errors/api_failure.dart';
import 'package:fleetora_merchant/features/settlements/settlements_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import '../accounting/finance_test_support.dart';

void main() {
  test('uncertain settlement retry preserves UUID and payload and blocks duplicate pending taps', () async {
    final api = AccountApiFake();
    final pending = Completer<void>();
    api.settlementBehavior = () => pending.future;
    final container = ProviderContainer(
      overrides: [
        merchantProvider.overrideWithValue(
          merchantFixture(permissions: ['FINANCE_VIEW', 'SETTLEMENT_REQUEST']),
        ),
        apiProvider.overrideWithValue(api),
      ],
    );
    addTearDown(container.dispose);
    final controller = container.read(settlementComposerProvider.notifier);
    controller.currency('USD');
    controller.notes('  Please review  ');
    final first = controller.submit();
    await controller.submit();
    expect(api.settlementCalls, hasLength(1));
    controller.currency('ILS');
    controller.notes('changed payload');
    pending.completeError(const ApiFailure(FailureKind.network));
    await first;
    expect(container.read(settlementComposerProvider).editable, isFalse);
    expect(container.read(settlementComposerProvider).error, isA<ApiFailure>());
    api.settlementBehavior = null;
    await controller.submit();
    expect(api.settlementCalls, hasLength(2));
    expect(api.settlementCalls[0], api.settlementCalls[1]);
    expect(api.settlementCalls[0].currency, 'USD');
    expect(api.settlementCalls[0].notes, 'Please review');
    expect(
      api.settlementCalls[0].key,
      matches(RegExp(r'^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$')),
    );
    expect(container.read(settlementComposerProvider).submitted, isTrue);
    await controller.submit();
    expect(api.settlementCalls, hasLength(2));
    controller.newRequest();
    controller.currency('USD');
    await controller.submit();
    expect(api.settlementCalls[2].key, isNot(api.settlementCalls[0].key));
  });

  test('composer checks permission even when invoked directly', () async {
    final api = AccountApiFake();
    final container = ProviderContainer(
      overrides: [
        merchantProvider.overrideWithValue(
          merchantFixture(permissions: ['FINANCE_VIEW']),
        ),
        apiProvider.overrideWithValue(api),
      ],
    );
    addTearDown(container.dispose);
    final controller = container.read(settlementComposerProvider.notifier)
      ..currency('USD');
    await controller.submit();
    expect(api.settlementCalls, isEmpty);
  });

  testWidgets('finance reader sees history without settlement write controls', (
    tester,
  ) async {
    final api = AccountApiFake();
    await tester.pumpWidget(
      testPage(const SettlementsPage(), api, permissions: ['FINANCE_VIEW']),
    );
    await tester.pumpAndSettle();
    expect(api.settlementPages, [1]);
    expect(api.statementPages, isEmpty);
    expect(find.text('Send settlement request'), findsNothing);
    expect(find.byType(TextFormField), findsNothing);
  });

  testWidgets('settlement uses server currency and waits for confirmation', (
    tester,
  ) async {
    final api = AccountApiFake();
    await tester.pumpWidget(
      testPage(
        const SettlementsPage(),
        api,
        permissions: ['FINANCE_VIEW', 'SETTLEMENT_REQUEST'],
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('USD').last);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Send settlement request'));
    await tester.tap(find.text('Send settlement request'));
    await tester.pumpAndSettle();
    expect(api.settlementCalls, isEmpty);
    expect(find.byType(AlertDialog), findsOneWidget);
    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();
    expect(api.settlementCalls.single.currency, 'USD');
    expect(find.text('Settlement request recorded'), findsOneWidget);
    expect(find.text('Paid'), findsNothing);
  });
}
