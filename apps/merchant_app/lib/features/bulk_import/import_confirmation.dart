import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/errors/api_failure.dart';
import '../../core/networking/models.dart';
import 'import_repository.dart';

class ImportWorkflowState {
  const ImportWorkflowState({
    this.filename,
    this.preview,
    this.idempotencyKey,
    this.attempted = false,
    this.busy = false,
    this.result,
    this.error,
  });
  final String? filename;
  final ImportPreview? preview;
  final String? idempotencyKey;
  final bool attempted;
  final bool busy;
  final ImportResult? result;
  final Object? error;
  bool get pending => attempted && result == null;
  bool get canChoose => !busy && !pending;
}

/// Kept for the authenticated session, independently of the import route's lifetime.
final importWorkflowProvider =
    NotifierProvider<ImportWorkflow, ImportWorkflowState>(ImportWorkflow.new);

class ImportWorkflow extends Notifier<ImportWorkflowState> {
  @override
  ImportWorkflowState build() => const ImportWorkflowState();

  Future<void> previewWorkbook(String filename, Uint8List bytes) async {
    if (!state.canChoose) throw StateError('Resolve the current import first');
    state = ImportWorkflowState(filename: filename, busy: true);
    try {
      final preview = await ref.read(importRepositoryProvider).preview(bytes);
      if (ref.mounted) {
        state = ImportWorkflowState(
          filename: filename,
          preview: ImportPreview(
            importId: preview.importId,
            rows: List.unmodifiable(
              preview.rows.map(
                (row) => ImportRow(
                  rowNumber: row.rowNumber,
                  errors: List.unmodifiable(row.errors),
                  preview: row.preview,
                ),
              ),
            ),
            validCount: preview.validCount,
            invalidCount: preview.invalidCount,
          ),
          idempotencyKey: const Uuid().v4(),
        );
      }
    } on Object catch (error) {
      if (ref.mounted) {
        state = ImportWorkflowState(filename: filename, error: error);
      }
    }
  }

  Future<ImportResult?> confirm() async {
    final current = state;
    final preview = current.preview;
    final key = current.idempotencyKey;
    if (current.busy ||
        preview == null ||
        key == null ||
        preview.validCount == 0) {
      return null;
    }
    if (current.result != null) return current.result;
    state = ImportWorkflowState(
      filename: current.filename,
      preview: preview,
      idempotencyKey: key,
      attempted: true,
      busy: true,
    );
    try {
      final result = await ref
          .read(importRepositoryProvider)
          .confirm(preview.importId, key);
      if (ref.mounted) {
        state = ImportWorkflowState(
          filename: current.filename,
          preview: preview,
          idempotencyKey: key,
          attempted: true,
          result: ImportResult(
            created: result.created,
            rejected: result.rejected,
            duplicates: result.duplicates,
            parcels: List.unmodifiable(result.parcels),
          ),
        );
      }
      return result;
    } on Object catch (error) {
      if (ref.mounted) {
        final rejected =
            error is ApiFailure &&
            {
              FailureKind.validation,
              FailureKind.conflict,
              FailureKind.forbidden,
              FailureKind.notFound,
            }.contains(error.kind);
        state = ImportWorkflowState(
          filename: current.filename,
          preview: preview,
          idempotencyKey: key,
          attempted: !rejected,
          error: error,
        );
      }
      return null;
    }
  }

  void clearResolved() {
    if (!state.canChoose) throw StateError('Resolve the current import first');
    state = const ImportWorkflowState();
  }
}
