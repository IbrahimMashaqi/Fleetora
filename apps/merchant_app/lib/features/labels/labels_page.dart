import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:printing/printing.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../app/localization/copy.dart';
import '../../core/authentication/session.dart';
import '../../core/networking/models.dart';
import '../../core/widgets/feedback.dart';
import 'label_pdf.dart';

final parcelLabelsProvider = FutureProvider.autoDispose
    .family<List<ParcelLabel>, String>((ref, ids) async {
      final api = ref.watch(apiProvider);
      final labels = <ParcelLabel>[];
      final unique = ids.split(',').where((id) => id.isNotEmpty).toSet();
      if (unique.isEmpty || unique.length > 200) {
        throw const FormatException('Invalid label selection');
      }
      // Bounded batches avoid a burst of hundreds of requests on a bulk import.
      final all = unique.toList(growable: false);
      for (var start = 0; start < all.length; start += 8) {
        final end = start + 8 > all.length ? all.length : start + 8;
        labels.addAll(
          await Future.wait(all.sublist(start, end).map(api.label)),
        );
      }
      return labels;
    });

class LabelsPage extends ConsumerStatefulWidget {
  const LabelsPage({super.key, required this.ids});
  final List<String> ids;
  @override
  ConsumerState<LabelsPage> createState() => _LabelsPageState();
}

class _LabelsPageState extends ConsumerState<LabelsPage> {
  bool _busy = false;
  Object? _error;
  Future<Uint8List> _pdf(List<ParcelLabel> labels) => buildLabelPdf(
    labels.map((label) => label.trackingNumber).toList(growable: false),
    heading: context.tr('parcel_label'),
    notice: context.tr('parcel_label_notice'),
    arabic: Localizations.localeOf(context).languageCode == 'ar',
  );
  Future<void> _perform(List<ParcelLabel> labels, bool share) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final info = await Printing.info();
      if (!mounted) return;
      if (share ? !info.canShare : !info.canPrint) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.tr('parcel_print_unavailable'))),
        );
        return;
      }
      final bytes = await _pdf(labels);
      if (!mounted) return;
      if (share) {
        await Printing.sharePdf(bytes: bytes, filename: 'fleetora-labels.pdf');
      } else {
        await Printing.layoutPdf(
          name: 'Fleetora labels',
          onLayout: (_) async => bytes,
        );
      }
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _preview(List<ParcelLabel> labels) async {
    final heading = context.tr('parcel_label');
    final notice = context.tr('parcel_label_notice');
    final arabic = Localizations.localeOf(context).languageCode == 'ar';
    await showDialog<void>(
      context: context,
      useRootNavigator: false,
      builder: (ctx) => Dialog.fullscreen(
        child: Column(
          children: [
            SafeArea(
              bottom: false,
              child: Align(
                alignment: AlignmentDirectional.centerEnd,
                child: IconButton(
                  tooltip: ctx.tr('back'),
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ),
            ),
            Expanded(
              child: PdfPreview(
                build: (_) => buildLabelPdf(
                  labels
                      .map((label) => label.trackingNumber)
                      .toList(growable: false),
                  heading: heading,
                  notice: notice,
                  arabic: arabic,
                ),
                canChangePageFormat: false,
                canChangeOrientation: false,
                useActions: false,
                canDebug: false,
                allowPrinting: false,
                allowSharing: false,
                onError: (context, error) =>
                    Center(child: Text(context.tr('parcel_document_error'))),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final key = widget.ids.toSet().join(',');
    return AsyncPage(
      value: ref.watch(parcelLabelsProvider(key)),
      onRetry: () => ref.invalidate(parcelLabelsProvider(key)),
      builder: (labels) => PageBody(
        children: [
          Text(
            context.tr('parcel_labels'),
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          Text(context.tr('parcel_label_notice')),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              FilledButton.icon(
                onPressed: _busy ? null : () => _perform(labels, false),
                icon: const Icon(Icons.print_outlined),
                label: Text(context.tr('parcel_print_labels')),
              ),
              OutlinedButton.icon(
                onPressed: _busy ? null : () => _perform(labels, true),
                icon: const Icon(Icons.share_outlined),
                label: Text(context.tr('parcel_share_pdf')),
              ),
              OutlinedButton.icon(
                onPressed: _busy ? null : () => _preview(labels),
                icon: const Icon(Icons.picture_as_pdf_outlined),
                label: Text(context.tr('parcel_preview_pdf')),
              ),
            ],
          ),
          if (_busy) const LinearProgressIndicator(),
          if (_error != null)
            Text(
              context.tr('parcel_document_error'),
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          for (final label in labels)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    SelectableText(
                      label.trackingNumber,
                      textDirection: TextDirection.ltr,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 16),
                    Semantics(
                      label: context.tr('parcel_tracking_qr'),
                      image: true,
                      child: QrImageView(
                        data: label.trackingNumber,
                        size: 220,
                        backgroundColor: Colors.white,
                        padding: const EdgeInsets.all(16),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
