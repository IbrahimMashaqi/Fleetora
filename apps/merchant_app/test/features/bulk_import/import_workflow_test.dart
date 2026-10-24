import 'dart:typed_data';
import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:fleetora_merchant/features/bulk_import/import_repository.dart';
import 'package:fleetora_merchant/features/bulk_import/import_confirmation.dart';
import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:fleetora_merchant/core/errors/api_failure.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final class SelectedWorkbook extends PlatformFile {
  SelectedWorkbook(this.name, this.chunks, {this.knownLength});
  @override
  final String name;
  final List<Uint8List> chunks;
  final int? knownLength;
  @override
  Uri get uri => Uri.parse('memory://workbook');
  @override
  int? lengthSync() => knownLength;
  @override
  Future<int?> length() async => knownLength;
  @override
  Stream<Uint8List> readAsByteStream() => Stream.fromIterable(chunks);
  @override
  Future<Uint8List> readAsBytes() async =>
      throw StateError('Unbounded read forbidden');
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class ConfirmationRepository implements ImportRepository {
  final calls = <(String, String)>[];
  final Completer<ImportResult> completer = Completer();
  bool failFirst = true;
  @override
  Future<ImportPreview> preview(Uint8List bytes) async => const ImportPreview(
    importId: 'import-id',
    rows: [],
    validCount: 1,
    invalidCount: 2,
  );
  @override
  Future<ImportResult> confirm(String id, String key) {
    calls.add((id, key));
    if (failFirst) {
      failFirst = false;
      return Future.error(const ApiFailure(FailureKind.network));
    }
    return completer.future;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test('uncertain confirmation keeps its UUID and blocks concurrent or completed duplicate writes', () async {
    final repository = ConfirmationRepository();
    final container = ProviderContainer(
      overrides: [importRepositoryProvider.overrideWithValue(repository)],
    );
    addTearDown(container.dispose);
    final confirmation = container.read(importWorkflowProvider.notifier);
    await confirmation.previewWorkbook('parcels.xlsx', Uint8List.fromList([1]));
    expect(await confirmation.confirm(), isNull);
    expect(container.read(importWorkflowProvider).error, isA<ApiFailure>());
    expect(container.read(importWorkflowProvider).attempted, isTrue);
    expect(container.read(importWorkflowProvider).result, isNull);
    final retry = confirmation.confirm();
    expect(await confirmation.confirm(), isNull);
    expect(repository.calls.length, 2);
    expect(repository.calls[0], repository.calls[1]);
    expect(
      container.read(importWorkflowProvider).idempotencyKey,
      matches(RegExp(r'^[a-f0-9-]{36}$')),
    );
    const result = ImportResult(
      created: 1,
      rejected: 2,
      duplicates: 3,
      parcels: ['existing-parcel'],
    );
    repository.completer.complete(result);
    expect(await retry, same(result));
    expect((await confirmation.confirm())!.parcels, result.parcels);
    expect(repository.calls.length, 2);
    expect(container.read(importWorkflowProvider).result!.rejected, 2);
    expect(container.read(importWorkflowProvider).result!.duplicates, 3);
  });
  test('accepts uppercase XLSX and preserves selected bytes', () async {
    final result = await readWorkbook(
      SelectedWorkbook('parcels.XLSX', [
        Uint8List.fromList([1, 2]),
        Uint8List.fromList([3]),
      ]),
    );
    expect(result, [1, 2, 3]);
  });
  test('rejects non-XLSX files before reading content', () async {
    await expectLater(
      readWorkbook(SelectedWorkbook('parcels.csv', [])),
      throwsA(
        isA<WorkbookSelectionException>().having(
          (error) => error.translationKey,
          'key',
          'import_wrongType',
        ),
      ),
    );
  });
  test(
    'rejects oversized files even when reported size is missing or inaccurate',
    () async {
      final file = SelectedWorkbook('parcels.xlsx', [
        Uint8List(maxWorkbookBytes),
        Uint8List(1),
      ], knownLength: 1);
      await expectLater(
        readWorkbook(file),
        throwsA(
          isA<WorkbookSelectionException>().having(
            (error) => error.translationKey,
            'key',
            'import_tooLarge',
          ),
        ),
      );
    },
  );
  test('rejects known oversized and empty files', () async {
    await expectLater(
      readWorkbook(
        SelectedWorkbook('parcels.xlsx', [], knownLength: maxWorkbookBytes + 1),
      ),
      throwsA(isA<WorkbookSelectionException>()),
    );
    await expectLater(
      readWorkbook(SelectedWorkbook('parcels.xlsx', [])),
      throwsA(
        isA<WorkbookSelectionException>().having(
          (error) => error.translationKey,
          'key',
          'import_emptyFile',
        ),
      ),
    );
  });
  test(
    'preserves field context and localizes server validation categories',
    () {
      expect(
        importErrorField('recipientPhone: invalid phone'),
        'recipientPhone',
      );
      expect(importErrorField('unexpectedInternalField: invalid'), isNull);
      expect(
        importErrorKey(
          'pieces: use plain text, not formulas, links or numbers',
        ),
        'import_plainText',
      );
      expect(
        importErrorKey('collectionMode does not match customer payment'),
        'import_collectionMismatch',
      );
      expect(
        importErrorKey(
          'Zone or commercial pricing is unavailable for this row',
        ),
        'import_pricingUnavailable',
      );
    },
  );
}
