import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/authentication/session.dart';
import '../../core/networking/merchant_api.dart';
import '../../core/networking/models.dart';

const maxWorkbookBytes = 1500000;

class WorkbookSelectionException implements Exception {
  const WorkbookSelectionException(this.translationKey);
  final String translationKey;
}

/// Enforces the upload envelope only. Workbook contents and pricing stay server-owned.
Future<Uint8List> readWorkbook(PlatformFile file) async {
  if (file.extension?.toLowerCase() != 'xlsx') {
    throw const WorkbookSelectionException('import_wrongType');
  }
  final knownLength = file.lengthSync();
  if (knownLength != null && knownLength > maxWorkbookBytes) {
    throw const WorkbookSelectionException('import_tooLarge');
  }
  final builder = BytesBuilder(copy: false);
  await for (final chunk in file.readAsByteStream()) {
    if (builder.length + chunk.length > maxWorkbookBytes) {
      throw const WorkbookSelectionException('import_tooLarge');
    }
    builder.add(chunk);
  }
  if (builder.isEmpty) {
    throw const WorkbookSelectionException('import_emptyFile');
  }
  return builder.takeBytes();
}

final importRepositoryProvider = Provider<ImportRepository>(
  (ref) => ImportRepository(ref.watch(apiProvider)),
);

class ImportRepository {
  ImportRepository(this.api);
  final MerchantApi api;
  Future<ImportPreview> preview(Uint8List bytes) =>
      api.importPreview(base64Encode(bytes));
  Future<ImportResult> confirm(String id, String key) =>
      api.importConfirm(id, key);
  Future<ImportTemplate> template() => api.template();
}

/// Translate backend validation categories without reproducing their English prose.
String importErrorKey(String error) {
  if (error.contains('plain text')) return 'import_plainText';
  if (error.contains('collectionMode does not match')) {
    return 'import_collectionMismatch';
  }
  if (error.contains('pricing is unavailable')) {
    return 'import_pricingUnavailable';
  }
  return 'import_invalidValue';
}

String? importErrorField(String error) {
  final field = error.split(':').first;
  return const {
        'recipientName',
        'recipientPhone',
        'secondaryPhone',
        'city',
        'destination',
        'zoneId',
        'finalCustomerAmount',
        'collectionMode',
        'description',
        'pieces',
        'merchantReference',
        'notes',
      }.contains(field)
      ? field
      : null;
}
