import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/copy.dart';
import '../../core/authentication/session.dart';
import '../../core/formatting/value_format.dart';
import '../../core/networking/models.dart';
import '../../core/widgets/feedback.dart';
import 'import_confirmation.dart';
import 'import_repository.dart';

class ImportPage extends ConsumerStatefulWidget {
  const ImportPage({super.key});
  @override
  ConsumerState<ImportPage> createState() => _ImportPageState();
}

class _ImportPageState extends ConsumerState<ImportPage> {
  bool _picking = false;
  bool _confirming = false;
  Object? _fileError;
  ImportWorkflowState get _workflow => ref.read(importWorkflowProvider);
  ImportPreview? get _preview => _workflow.preview;
  ImportResult? get _result => _workflow.result;
  String? get _filename => _workflow.filename;
  bool get _attempted => _workflow.attempted;
  bool get _busy => _picking || _workflow.busy;
  Object? get _error => _fileError ?? _workflow.error;

  Future<void> _template() async {
    if (_busy || _confirming) return;
    setState(() {
      _picking = true;
      _fileError = null;
    });
    try {
      final template = await ref.read(importRepositoryProvider).template();
      final saved = await FilePicker.saveFile(
        fileName: template.filename,
        bytes: base64Decode(template.fileBase64),
        mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      if (mounted && saved != null) showSuccess(context);
    } on Object catch (error) {
      if (mounted) setState(() => _fileError = error);
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  Future<void> _pick() async {
    if (_busy || _confirming || !_workflow.canChoose) return;
    final controller = ref.read(importWorkflowProvider.notifier);
    setState(() {
      _picking = true;
      _fileError = null;
    });
    try {
      final file = await FilePicker.pickFile(
        type: FileType.custom,
        allowedExtensions: ['xlsx'],
      );
      if (file == null) return;
      final bytes = await readWorkbook(file);
      if (!mounted) return;
      await controller.previewWorkbook(file.name, bytes);
    } on Object catch (error) {
      if (mounted) setState(() => _fileError = error);
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  Future<void> _confirm() async {
    final preview = _preview;
    if (_busy ||
        _confirming ||
        preview == null ||
        preview.validCount == 0 ||
        _result != null) {
      return;
    }
    setState(() => _confirming = true);
    try {
      if (!_attempted) {
        final approved = await showConfirmation(
          context,
          title: context.tr('import_confirm'),
          message:
              '${context.tr('import_confirmMessage')} ${preview.validCount} ${context.tr('import_valid')}, ${preview.invalidCount} ${context.tr('import_invalid')}.',
        );
        if (!approved || !mounted) return;
      }
      await ref.read(importWorkflowProvider.notifier).confirm();
    } finally {
      if (mounted) setState(() => _confirming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final merchant = ref.watch(merchantProvider);
    if (!allowed(merchant, 'PARCEL_IMPORT')) {
      return PageBody(children: [Text(context.tr('import_denied'))]);
    }
    ref.watch(importWorkflowProvider);
    final preview = _preview;
    final result = _result;
    return PageBody(
      children: [
        Text(
          context.tr('import_title'),
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        Text(context.tr('import_instructions')),
        OutlinedButton.icon(
          onPressed: _busy || _confirming ? null : _template,
          icon: const Icon(Icons.download_outlined),
          label: Text(context.tr('import_template')),
        ),
        if (!_attempted)
          FilledButton.icon(
            onPressed: _busy || _confirming ? null : _pick,
            icon: const Icon(Icons.upload_file_outlined),
            label: Text(context.tr('import_select')),
          ),
        if (_filename != null)
          Text(_filename!, textDirection: TextDirection.ltr),
        if (_busy)
          Semantics(
            label: context.tr('loading'),
            child: const LinearProgressIndicator(),
          ),
        if (_error case final WorkbookSelectionException selection)
          Semantics(
            liveRegion: true,
            child: Text(
              context.tr(selection.translationKey),
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          )
        else if (_error != null)
          ErrorNotice(error: _error!),
        if (result != null) ...[
          Text(
            context.tr('import_result'),
            style: Theme.of(context).textTheme.titleLarge,
          ),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [
              Chip(
                label: Text(
                  '${context.tr('import_created')}: ${result.created}',
                ),
              ),
              Chip(
                label: Text(
                  '${context.tr('import_rejected')}: ${result.rejected}',
                ),
              ),
              Chip(
                label: Text(
                  '${context.tr('import_duplicates')}: ${result.duplicates}',
                ),
              ),
            ],
          ),
          if (result.parcels.isNotEmpty &&
              allowed(merchant, 'PARCEL_VIEW')) ...[
            FilledButton.icon(
              onPressed: () => context.push(
                Uri(
                  path: '/labels',
                  queryParameters: {'ids': result.parcels.join(',')},
                ).toString(),
              ),
              icon: const Icon(Icons.qr_code),
              label: Text(context.tr('import_labels')),
            ),
            Text(context.tr('import_parcelLinks')),
            for (var index = 0; index < result.parcels.length; index++)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text('${context.tr('import_parcel')} ${index + 1}'),
                subtitle: Text(
                  result.parcels[index],
                  textDirection: TextDirection.ltr,
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.push(
                  '/parcels/${Uri.encodeComponent(result.parcels[index])}',
                ),
              ),
          ],
          OutlinedButton(
            onPressed: () {
              ref.read(importWorkflowProvider.notifier).clearResolved();
              setState(() => _fileError = null);
            },
            child: Text(context.tr('import_another')),
          ),
        ] else if (preview != null) ...[
          Text(
            context.tr('import_review'),
            style: Theme.of(context).textTheme.titleLarge,
          ),
          Wrap(
            spacing: 12,
            children: [
              Chip(
                label: Text(
                  '${context.tr('import_valid')}: ${preview.validCount}',
                ),
              ),
              Chip(
                label: Text(
                  '${context.tr('import_invalid')}: ${preview.invalidCount}',
                ),
              ),
            ],
          ),
          Text(context.tr('import_validOnly')),
          if (_attempted) Text(context.tr('import_uncertain')),
          SubmitButton(
            busy: _busy,
            onPressed: preview.validCount > 0 && !_confirming ? _confirm : null,
            label: context.tr(
              _attempted ? 'import_retrySame' : 'import_confirm',
            ),
          ),
          for (final row in preview.rows) ImportPreviewRow(row: row),
        ],
      ],
    );
  }
}

class ImportPreviewRow extends StatelessWidget {
  const ImportPreviewRow({super.key, required this.row});
  final ImportRow row;
  @override
  Widget build(BuildContext context) {
    final preview = row.preview;
    String money(String value, String currency) {
      return exactMoney(
        value,
        currency,
        Localizations.localeOf(context).languageCode,
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${context.tr('import_row')} ${row.rowNumber} — '
              '${context.tr(row.errors.isEmpty ? 'import_valid' : 'import_invalid')}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            for (final error in row.errors)
              Text(
                '${importErrorField(error) == null ? '' : '${context.tr('import_field_${importErrorField(error)}')}: '}'
                '${context.tr(importErrorKey(error))}',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            if (preview != null) ...[
              Text(
                '${context.tr('import_customerPayable')}: ${money(preview.finalCustomerAmount, preview.currency)}',
              ),
              Text(
                '${context.tr('import_fee')}: ${money(preview.deliveryFee, preview.currency)}',
              ),
              Text(
                '${context.tr('import_proceeds')}: ${money(preview.expectedMerchantProceeds, preview.currency)}',
              ),
              Text('${preview.city} · ${preview.zoneName}'),
            ],
          ],
        ),
      ),
    );
  }
}
