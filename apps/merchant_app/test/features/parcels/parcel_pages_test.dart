import 'dart:async';

import 'package:fleetora_merchant/core/errors/api_failure.dart';
import 'package:fleetora_merchant/core/location/geo_pin.dart';
import 'package:fleetora_merchant/core/location/pin_picker.dart';
import 'package:fleetora_merchant/core/networking/merchant_api.dart';
import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:fleetora_merchant/features/parcels/parcel_details_page.dart';
import 'package:fleetora_merchant/features/parcels/parcel_form_page.dart';
import 'package:fleetora_merchant/features/parcels/parcels_page.dart';
import 'package:fleetora_merchant/features/pricing/pricing_summary.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../accounting/finance_test_support.dart';
import 'parcel_draft_test.dart' show quote, zone;

const parcelValue = Parcel(
  id: 'parcel-1',
  trackingNumber: 'FL-TRACKING',
  recipientName: 'Recipient',
  recipientPhone: '0599123456',
  city: 'Ramallah',
  destination: 'Main street',
  deliveryZoneId: 'zone',
  finalCustomerAmount: '150.000',
  currency: 'ILS',
  custody: 'COMPANY',
  collectionMode: 'COD',
  description: 'Books',
  pieces: 1,
  status: 'RECEIVED_FROM_MERCHANT',
  revision: 2,
  createdAt: '2026-10-22T10:00:00Z',
  deliveryFee: '15.000',
  locationLabel: 'Main warehouse',
  locationSource: 'CONFIRMED_RECEIPT',
);

class ParcelApiFake implements MerchantApi {
  final queries = <({int page, String search, String? status})>[];
  final writes = <Json>[];
  Completer<PricingPreview>? delayedPreview;
  Future<ParcelDetails> Function()? detailBehavior;
  Future<Parcel> Function(Json)? createBehavior;
  ParcelActions actions = const ParcelActions(
    edit: false,
    cancel: false,
    requestAmendment: true,
    requestCancellation: true,
  );
  @override
  Future<List<Zone>> zones() async => [zone];
  @override
  Future<PricingPreview> preview(String zoneId, String amount) async =>
      delayedPreview?.future ?? quote;
  @override
  Future<Parcel> createParcel(Json input) async {
    writes.add(Map<String, Object?>.from(input));
    return createBehavior?.call(input) ??
        Future<Parcel>.error(const ApiFailure(FailureKind.network));
  }

  @override
  Future<PageResult<Parcel>> parcels({
    int page = 1,
    String search = '',
    String? status,
  }) async {
    queries.add((page: page, search: search, status: status));
    return PageResult(
      items: const [parcelValue],
      page: page,
      pageSize: 25,
      hasNext: page == 1,
    );
  }

  @override
  Future<ParcelDetails> parcel(String id) async =>
      detailBehavior?.call() ??
      ParcelDetails(
        parcel: parcelValue,
        events: const [],
        historyAvailable: false,
        actions: actions,
      );
  @override
  Future<List<ParcelRequest>> parcelRequests(String id) async => const [];
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Unexpected API call ${invocation.memberName}');
}

Future<void> fillForm(WidgetTester tester) async {
  for (final entry in {
    'recipientName': 'Recipient',
    'recipientPhone': '0599123456',
  }.entries) {
    await reveal(tester, find.byKey(ValueKey(entry.key)));
    await tester.enterText(find.byKey(ValueKey(entry.key)), entry.value);
  }
  await reveal(tester, find.byKey(const ValueKey('zoneDropdown')));
  await tester.tap(find.byKey(const ValueKey('zoneDropdown')));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Ramallah · Ramallah').last);
  await tester.pumpAndSettle();
  for (final entry in {
    'destination': 'Main street',
    'amount': '150',
    'description': 'Books',
  }.entries) {
    await reveal(tester, find.byKey(ValueKey(entry.key)));
    await tester.enterText(find.byKey(ValueKey(entry.key)), entry.value);
  }
}

Future<void> reveal(
  WidgetTester tester,
  Finder finder, {
  double delta = 200,
}) async {
  if (finder.evaluate().isNotEmpty) {
    await tester.ensureVisible(finder);
  } else {
    await tester.scrollUntilVisible(
      finder,
      delta,
      scrollable: find.byType(Scrollable).first,
    );
  }
  await tester.pumpAndSettle();
}

void main() {
  for (final kind in [FailureKind.notFound, FailureKind.forbidden]) {
    testWidgets('permanent $kind detail failure waits for explicit retry', (
      tester,
    ) async {
      var reads = 0;
      final api = ParcelApiFake()
        ..detailBehavior = () async {
          reads++;
          throw ApiFailure(kind);
        };
      await tester.pumpWidget(
        testPage(const ParcelDetailsPage(id: 'missing'), api, owner: true),
      );
      await tester.pumpAndSettle();
      for (var second = 0; second < 40; second++) {
        await tester.pump(const Duration(seconds: 1));
      }
      expect(reads, 1, reason: 'A permanent response must not poll the API');
      expect(find.text('Try again'), findsOneWidget);

      api.detailBehavior = null;
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(find.text(parcelValue.trackingNumber), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('transient detail read still recovers automatically', (
    tester,
  ) async {
    var reads = 0;
    final api = ParcelApiFake();
    api.detailBehavior = () async {
      if (++reads == 1) throw const ApiFailure(FailureKind.network);
      return ParcelDetails(
        parcel: parcelValue,
        events: const [],
        historyAvailable: false,
        actions: api.actions,
      );
    };
    await tester.pumpWidget(
      testPage(const ParcelDetailsPage(id: 'parcel-1'), api, owner: true),
    );
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(reads, 2);
    expect(find.text(parcelValue.trackingNumber), findsOneWidget);
  });
  testWidgets(
    'pricing shows backend inclusive values with no client recalculation in Arabic RTL',
    (tester) async {
      await tester.pumpWidget(
        testPage(
          const PricingSummary(preview: quote),
          ParcelApiFake(),
          language: 'ar',
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('١٥٠٫٠٠٠ ILS'), findsOneWidget);
      expect(find.text('١٥٫٠٠٠ ILS'), findsNWidgets(2));
      expect(find.text('١٣٥٫٠٠٠ ILS'), findsOneWidget);
      expect(
        Directionality.of(tester.element(find.byType(PricingSummary))),
        TextDirection.rtl,
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('search and pagination send real query and reset page', (
    tester,
  ) async {
    final api = ParcelApiFake();
    await tester.pumpWidget(testPage(const ParcelsPage(), api, owner: true));
    await tester.pumpAndSettle();
    await reveal(tester, find.text('Next'));
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(api.queries.last.page, 2);
    await reveal(tester, find.byType(TextField), delta: -200);
    await tester.enterText(find.byType(TextField), 'tracking');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(api.queries.last, (page: 1, search: 'tracking', status: null));
  });
  testWidgets(
    'detail uses server actions, displays confirmed location, hides unavailable history',
    (tester) async {
      await tester.pumpWidget(
        testPage(
          const ParcelDetailsPage(id: 'parcel-1'),
          ParcelApiFake(),
          owner: true,
        ),
      );
      await tester.pumpAndSettle();
      await reveal(tester, find.text('Main warehouse'));
      expect(find.text('Main warehouse'), findsOneWidget);
      await reveal(tester, find.text('Request parcel amendment'));
      expect(find.text('Request parcel amendment'), findsOneWidget);
      expect(find.text('Edit parcel'), findsNothing);
      expect(find.text('Status timeline'), findsNothing);
      expect(find.text('Cancel parcel before receipt'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('form denies create permission without reading zones', (
    tester,
  ) async {
    await tester.pumpWidget(testPage(const ParcelFormPage(), ParcelApiFake()));
    await tester.pumpAndSettle();
    expect(
      find.text('You do not have permission for this action.'),
      findsOneWidget,
    );
  });
  testWidgets(
    'changing an amount while preview is pending discards stale reply',
    (tester) async {
      final api = ParcelApiFake()..delayedPreview = Completer<PricingPreview>();
      await tester.pumpWidget(
        testPage(const ParcelFormPage(), api, owner: true),
      );
      await tester.pumpAndSettle();
      await fillForm(tester);
      await reveal(tester, find.text('Preview contractual price'), delta: -200);
      await tester.tap(find.text('Preview contractual price'));
      await tester.pump();
      await reveal(tester, find.byKey(const ValueKey('amount')), delta: -200);
      await tester.enterText(find.byKey(const ValueKey('amount')), '151');
      api.delayedPreview!.complete(quote);
      await tester.pumpAndSettle();
      expect(find.byType(PricingSummary), findsNothing);
      expect(api.writes, isEmpty);
    },
  );
  testWidgets(
    'selected pin survives form rebuilds and uncertain submission retries',
    (tester) async {
      final api = ParcelApiFake();
      await tester.pumpWidget(
        testPage(const ParcelFormPage(), api, owner: true),
      );
      await tester.pumpAndSettle();
      await fillForm(tester);
      final pin = GeoPin(31.917253184, 35.203481726);
      await reveal(tester, find.byType(PinField), delta: -200);
      // Exercise the form boundary; actual native map touches are covered by the
      // device integration test, without replacing the native platform there.
      tester.widget<PinField>(find.byType(PinField)).onChanged(pin);
      await tester.pumpAndSettle();
      await reveal(tester, find.byKey(const ValueKey('amount')));
      await tester.enterText(find.byKey(const ValueKey('amount')), '151');
      await tester.enterText(find.byKey(const ValueKey('amount')), '150');
      await tester.pumpAndSettle();
      await reveal(tester, find.byType(PinField), delta: -200);
      expect(tester.widget<PinField>(find.byType(PinField)).value, same(pin));
      await reveal(tester, find.text('Preview contractual price'), delta: -200);
      await tester.tap(find.text('Preview contractual price'));
      await tester.pumpAndSettle();
      await reveal(tester, find.widgetWithText(FilledButton, 'Create parcel'));
      await tester.tap(find.widgetWithText(FilledButton, 'Create parcel'));
      await tester.pumpAndSettle();
      expect(api.writes, hasLength(1));
      await reveal(tester, find.text('Retry original submission'));
      await tester.tap(find.text('Retry original submission'));
      await tester.pumpAndSettle();
      expect(api.writes, hasLength(2));
      expect(api.writes[1], api.writes[0]);
      expect(api.writes[0]['latitude'], pin.latitude);
      expect(api.writes[0]['longitude'], pin.longitude);
      expect(
        api.writes[0]['idempotencyKey'],
        matches(RegExp(r'^[0-9a-f-]{36}$')),
      );
      expect(tester.takeException(), isNull);
    },
  );
}
