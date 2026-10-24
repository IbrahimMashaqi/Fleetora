import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fleetora_merchant/app/localization/generated/app_localizations.dart';
import 'package:fleetora_merchant/core/authentication/session.dart';
import 'package:fleetora_merchant/core/errors/api_failure.dart';
import 'package:fleetora_merchant/core/networking/merchant_api.dart';
import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:fleetora_merchant/features/bulk_import/import_confirmation.dart';
import 'package:fleetora_merchant/features/bulk_import/import_page.dart';
import 'package:fleetora_merchant/features/bulk_import/import_repository.dart';
import 'package:fleetora_merchant/features/parcels/parcel_details_page.dart';
import 'package:fleetora_merchant/features/parcels/parcel_providers.dart';
import 'package:fleetora_merchant/features/pickups/pickup_form_page.dart';
import 'package:fleetora_merchant/features/pickups/pickup_repository.dart';
import 'package:fleetora_merchant/features/pickups/pickup_submission.dart';

import 'features/accounting/finance_test_support.dart' show merchantFixture;
import 'features/parcels/parcel_pages_test.dart' show parcelValue;

const confirmedPickup = Pickup(
  id: 'pickup',
  method: 'WAREHOUSE_DROPOFF',
  status: 'REQUESTED',
  revision: 1,
  pickupAddress: 'Main street',
);

class LostPickup implements PickupRepository {
  final calls = <Json>[];
  @override
  Future<Pickup> create(Json input) async {
    calls.add(Map.of(input));
    if (calls.length == 1) throw const ApiFailure(FailureKind.network);
    return confirmedPickup;
  }

  @override
  Never noSuchMethod(Invocation invocation) =>
      throw UnsupportedError(invocation.memberName.toString());
}

class LostImport implements ImportRepository {
  final calls = <(String, String)>[];
  @override
  Future<ImportPreview> preview(Uint8List bytes) async => const ImportPreview(
    importId: 'batch',
    rows: [],
    validCount: 1,
    invalidCount: 0,
  );
  @override
  Future<ImportResult> confirm(String id, String key) async {
    calls.add((id, key));
    if (calls.length == 1) throw const ApiFailure(FailureKind.network);
    return const ImportResult(
      created: 1,
      rejected: 0,
      duplicates: 0,
      parcels: ['parcel'],
    );
  }

  @override
  Never noSuchMethod(Invocation invocation) =>
      throw UnsupportedError(invocation.memberName.toString());
}

class LostCancellation implements MerchantApi {
  final calls = <Json>[];
  @override
  Future<void> cancellationRequest(String id, Json input) async {
    calls.add(Map.of(input));
    if (calls.length == 1) throw const ApiFailure(FailureKind.network);
  }

  @override
  Future<ParcelDetails> parcel(String id) async => const ParcelDetails(
    parcel: parcelValue,
    events: [],
    historyAvailable: false,
    actions: ParcelActions(
      edit: false,
      cancel: false,
      requestAmendment: false,
      requestCancellation: true,
    ),
  );
  @override
  Future<List<ParcelRequest>> parcelRequests(String id) async => [];
  @override
  Never noSuchMethod(Invocation invocation) =>
      throw UnsupportedError(invocation.memberName.toString());
}

Widget tree(ProviderContainer container, Widget child) =>
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(body: child),
      ),
    );
Future<void> reveal(WidgetTester tester, Finder target) async {
  await tester.scrollUntilVisible(
    target,
    250,
    scrollable: find.byType(Scrollable).first,
    maxScrolls: 30,
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'pickup route disposal never replaces an uncertain payload or UUID',
    (tester) async {
      final repo = LostPickup();
      final container = ProviderContainer(
        overrides: [
          merchantProvider.overrideWithValue(merchantFixture(owner: true)),
          pickupRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);
      await container.read(pickupSubmissionProvider.notifier).start({
        'parcelIds': ['parcel'],
        'method': 'WAREHOUSE_DROPOFF',
      });
      await tester.pumpWidget(tree(container, const PickupFormPage()));
      await tester.pumpAndSettle();
      await tester.pumpWidget(tree(container, const SizedBox()));
      await tester.pumpAndSettle();
      await tester.pumpWidget(tree(container, const PickupFormPage()));
      await tester.pumpAndSettle();
      expect(repo.calls.length, 1);
      final retry = find.widgetWithText(FilledButton, 'Retry this request');
      expect(retry, findsOneWidget);
      // Retry via the session controller avoids navigating outside this unit's test router.
      expect(
        await container.read(pickupSubmissionProvider.notifier).retry(),
        confirmedPickup,
      );
      expect(repo.calls.length, 2);
      expect(repo.calls[1], repo.calls[0]);
    },
  );
  testWidgets(
    'import route restores preview and retry key after uncertain confirmation',
    (tester) async {
      final repo = LostImport();
      final container = ProviderContainer(
        overrides: [
          merchantProvider.overrideWithValue(merchantFixture(owner: true)),
          importRepositoryProvider.overrideWithValue(repo),
        ],
      );
      addTearDown(container.dispose);
      final controller = container.read(importWorkflowProvider.notifier);
      await controller.previewWorkbook('parcels.xlsx', Uint8List.fromList([1]));
      await controller.confirm();
      await tester.pumpWidget(tree(container, const ImportPage()));
      await tester.pumpAndSettle();
      await tester.pumpWidget(tree(container, const SizedBox()));
      await tester.pumpAndSettle();
      await tester.pumpWidget(tree(container, const ImportPage()));
      await tester.pumpAndSettle();
      expect(find.text('parcels.xlsx'), findsOneWidget);
      expect(repo.calls.length, 1);
      final retry = find.widgetWithText(
        FilledButton,
        'Retry this confirmation',
      );
      expect(container.read(importWorkflowProvider).pending, true);
      await reveal(tester, retry);
      await tester.tap(retry);
      await tester.pumpAndSettle();
      expect(container.read(importWorkflowProvider).result!.created, 1);
      expect(repo.calls[1], repo.calls[0]);
    },
  );
  testWidgets(
    'cancellation request reopens with original reason revision and UUID',
    (tester) async {
      final api = LostCancellation();
      final container = ProviderContainer(
        overrides: [
          merchantProvider.overrideWithValue(merchantFixture(owner: true)),
          apiProvider.overrideWithValue(api),
        ],
      );
      addTearDown(container.dispose);
      final pending = container.read(
        cancellationSubmissionProvider(parcelValue.id),
      );
      pending.pending = (
        request: true,
        revision: 2,
        reason: 'Customer requested cancellation',
      );
      final input = <String, Object?>{
        'revision': 2,
        'reason': pending.pending!.reason,
        'idempotencyKey': pending.key,
      };
      await expectLater(
        api.cancellationRequest(parcelValue.id, input),
        throwsA(isA<ApiFailure>()),
      );
      await tester.pumpWidget(
        tree(container, ParcelDetailsPage(id: parcelValue.id)),
      );
      await tester.pumpAndSettle();
      await tester.pumpWidget(tree(container, const SizedBox()));
      await tester.pumpAndSettle();
      await tester.pumpWidget(
        tree(container, ParcelDetailsPage(id: parcelValue.id)),
      );
      await tester.pumpAndSettle();
      expect(api.calls.length, 1);
      final retry = find.widgetWithText(
        FilledButton,
        'Retry original submission',
      );
      await reveal(tester, retry);
      await tester.tap(retry);
      await tester.pumpAndSettle();
      expect(api.calls.length, 2);
      expect(api.calls[1], api.calls[0]);
      expect(pending.pending, isNull);
    },
  );
}
