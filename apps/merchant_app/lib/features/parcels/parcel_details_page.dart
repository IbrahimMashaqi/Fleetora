import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../../app/localization/copy.dart';
import '../../core/authentication/session.dart';
import '../../core/errors/api_failure.dart';
import '../../core/formatting/value_format.dart';
import '../../core/networking/models.dart';
import '../../core/widgets/feedback.dart';
import 'parcel_providers.dart';

class ParcelDetailsPage extends ConsumerStatefulWidget {
  const ParcelDetailsPage({super.key, required this.id});
  final String id;
  @override
  ConsumerState<ParcelDetailsPage> createState() => _ParcelDetailsPageState();
}

class _ParcelDetailsPageState extends ConsumerState<ParcelDetailsPage> {
  final _reason = TextEditingController();
  late final CancellationSubmission _submission;
  String get _requestKey => _submission.key;
  bool _busy = false;
  Object? _error;
  CancellationInput? get _pending => _submission.pending;
  set _pending(CancellationInput? value) {
    _submission.pending = value;
  }

  @override
  void initState() {
    super.initState();
    _submission = ref.read(cancellationSubmissionProvider(widget.id));
    _reason.text = _pending?.reason ?? '';
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  void _refresh() {
    ref.invalidate(parcelDetailsProvider(widget.id));
    ref.invalidate(parcelRequestsProvider(widget.id));
    ref.invalidate(parcelsProvider);
  }

  Future<void> _cancel(Parcel parcel, bool request) async {
    if (_busy) return;
    if (_pending == null) {
      final reason = _reason.text.trim();
      if (reason.length < 3 || reason.length > 500) {
        setState(() => _error = null);
        return;
      }
      if (!await showConfirmation(
        context,
        title: context.tr(
          request ? 'parcel_request_cancellation' : 'parcel_cancel',
        ),
        message: context.tr(
          request ? 'parcel_cancellation_help' : 'parcel_cancel_confirm',
        ),
      )) {
        return;
      }
      if (!mounted) return;
      _pending = (request: request, revision: parcel.revision, reason: reason);
    }
    final pending = _pending!;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (pending.request) {
        await ref.read(apiProvider).cancellationRequest(widget.id, {
          'revision': pending.revision,
          'reason': pending.reason,
          'idempotencyKey': _requestKey,
        });
      } else {
        await ref
            .read(apiProvider)
            .cancelParcel(widget.id, pending.revision, pending.reason);
      }
      if (!mounted) return;
      setState(() {
        _pending = null;
        _reason.clear();
        _submission.complete();
      });
      showSuccess(context);
      _refresh();
    } on Object catch (error) {
      if (mounted) {
        setState(() {
          _error = error;
          if (error is ApiFailure &&
              (error.kind == FailureKind.validation ||
                  error.kind == FailureKind.conflict ||
                  error.kind == FailureKind.forbidden ||
                  error.kind == FailureKind.notFound)) {
            _pending = null;
          }
        });
        if (error is ApiFailure && error.kind == FailureKind.conflict) {
          _refresh();
        }
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _heading(String key) =>
      Text(context.tr(key), style: Theme.of(context).textTheme.titleMedium);
  String _date(String value) {
    final date = DateTime.tryParse(value);
    return date == null
        ? context.tr('parcel_date_unavailable')
        : DateFormat.yMMMd(Localizations.localeOf(context).toLanguageTag())
              .add_jm()
              .format(date.toLocal());
  }

  @override
  Widget build(BuildContext context) => AsyncPage(
    value: ref.watch(parcelDetailsProvider(widget.id)),
    onRetry: _refresh,
    builder: (details) {
      final parcel = details.parcel;
      final actions = details.actions;
      return PageBody(
        children: [
          SelectableText(
            parcel.trackingNumber,
            textDirection: TextDirection.ltr,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          Wrap(
            spacing: 8,
            children: [StatusBadge(parcel.status), StatusBadge(parcel.custody)],
          ),
          _heading('parcel_recipient'),
          Text(parcel.recipientName),
          Text(parcel.recipientPhone, textDirection: TextDirection.ltr),
          if (parcel.secondaryPhone != null)
            Text(parcel.secondaryPhone!, textDirection: TextDirection.ltr),
          Text('${parcel.city} · ${parcel.destination}'),
          _heading('parcel_payment'),
          Text(
            '${context.tr('parcel_final_amount')}: ${parcel.finalCustomerAmount == null ? '—' : exactMoney(parcel.finalCustomerAmount!, parcel.currency, Localizations.localeOf(context).toLanguageTag())}',
          ),
          Text(context.tr('status_${parcel.collectionMode}')),
          if (parcel.deliveryFee != null)
            Text(
              '${context.tr('parcel_delivery_fee')}: ${exactMoney(parcel.deliveryFee!, parcel.currency, Localizations.localeOf(context).toLanguageTag())}',
            ),
          if (parcel.collectionMode == 'PREPAID')
            Text(context.tr('parcel_prepaid_help')),
          _heading('parcel_package'),
          Text(
            '${parcel.description} · ${parcel.pieces} ${context.tr('parcel_pieces')}',
          ),
          if (parcel.merchantReference != null)
            Text(
              '${context.tr('parcel_reference')}: ${parcel.merchantReference}',
            ),
          if (parcel.customerNotes != null) Text(parcel.customerNotes!),
          _heading('parcel_current_location'),
          Text(context.tr('status_${parcel.custody}')),
          if (parcel.locationLabel != null) Text(parcel.locationLabel!),
          if (parcel.locationSource != null)
            Text(context.tr('location_${parcel.locationSource}')),
          if (parcel.locationUpdatedAt != null)
            Text(_date(parcel.locationUpdatedAt!)),
          OutlinedButton.icon(
            onPressed: () => context.push(
              '/labels?ids=${Uri.encodeQueryComponent(parcel.id)}',
            ),
            icon: const Icon(Icons.qr_code_2),
            label: Text(context.tr('parcel_label')),
          ),
          if (actions?.edit == true)
            OutlinedButton(
              onPressed: () => context.push('/parcels/${parcel.id}/edit'),
              child: Text(context.tr('parcel_edit')),
            ),
          if (actions?.requestAmendment == true) ...[
            Text(context.tr('parcel_amendment_help')),
            OutlinedButton(
              onPressed: () => context.push('/parcels/${parcel.id}/amend'),
              child: Text(context.tr('parcel_request_amendment')),
            ),
          ],
          if (actions?.cancel == true ||
              actions?.requestCancellation == true ||
              _pending != null) ...[
            _heading(
              actions?.cancel == true
                  ? 'parcel_cancel'
                  : 'parcel_request_cancellation',
            ),
            if (actions?.requestCancellation == true)
              Text(context.tr('parcel_cancellation_help')),
            TextField(
              controller: _reason,
              maxLength: 500,
              maxLines: 2,
              enabled: !_busy && _pending == null,
              decoration: InputDecoration(
                labelText: context.tr('parcel_cancel_reason'),
                helperText: context.tr('parcel_reason_error'),
              ),
              onChanged: (_) => setState(() {}),
            ),
            if (_pending != null && !_busy)
              Text(context.tr('parcel_uncertain_write')),
            if (_error != null) ErrorNotice(error: _error!),
            SubmitButton(
              busy: _busy,
              onPressed: _pending != null || _reason.text.trim().length >= 3
                  ? () => _cancel(parcel, actions?.requestCancellation == true)
                  : null,
              label: context.tr(
                _pending != null
                    ? 'parcel_retry_write'
                    : actions?.requestCancellation == true
                    ? 'parcel_send_cancellation'
                    : 'parcel_cancel',
              ),
            ),
          ],
          _heading('parcel_requests'),
          _Requests(id: widget.id),
          if (details.historyAvailable) ...[
            _heading('parcel_timeline'),
            if (details.events.isEmpty) Text(context.tr('parcel_no_events')),
            for (final event in details.events)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        context.tr('status_${event.event}'),
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      if (event.toStatus != null)
                        Text(
                          [
                            if (event.fromStatus != null)
                              context.tr('status_${event.fromStatus}'),
                            context.tr('status_${event.toStatus}'),
                          ].join(' → '),
                        ),
                      if (event.custody != null)
                        Text(context.tr('status_${event.custody}')),
                      if (event.locationLabel != null)
                        Text(event.locationLabel!),
                      Text(_date(event.occurredAt)),
                    ],
                  ),
                ),
              ),
          ],
          OutlinedButton.icon(
            onPressed: _refresh,
            icon: const Icon(Icons.refresh),
            label: Text(context.tr('refresh')),
          ),
        ],
      );
    },
  );
}

class _Requests extends ConsumerWidget {
  const _Requests({required this.id});
  final String id;
  @override
  Widget build(BuildContext context, WidgetRef ref) => AsyncPage(
    value: ref.watch(parcelRequestsProvider(id)),
    onRetry: () => ref.invalidate(parcelRequestsProvider(id)),
    builder: (requests) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (requests.isEmpty) Text(context.tr('parcel_no_requests')),
        for (final request in requests)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    context.tr(
                      request.kind == 'AMEND'
                          ? 'parcel_request_amendment'
                          : 'parcel_request_cancellation',
                    ),
                  ),
                  StatusBadge(request.status),
                  Text(request.reason),
                  if (request.reviewReason != null) Text(request.reviewReason!),
                ],
              ),
            ),
          ),
      ],
    ),
  );
}
