import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/copy.dart';
import '../../core/authentication/session.dart';
import '../../core/errors/api_failure.dart';
import '../../core/location/geo_pin.dart';
import '../../core/location/pin_picker.dart';
import '../../core/networking/merchant_api.dart';
import '../../core/networking/models.dart';
import '../../core/widgets/feedback.dart';
import '../pricing/pricing_summary.dart';
import 'parcel_draft.dart';
import 'parcel_providers.dart';

class ParcelFormPage extends ConsumerWidget {
  const ParcelFormPage({super.key, this.parcelId, this.amendment = false});
  final String? parcelId;
  final bool amendment;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final zones = ref.watch(deliveryZonesProvider);
    final merchant = ref.watch(merchantProvider);
    final permission = parcelId == null ? 'PARCEL_CREATE' : 'PARCEL_EDIT';
    if (!allowed(merchant, permission)) {
      return const ErrorNotice(error: ApiFailure(FailureKind.forbidden));
    }
    return AsyncPage(
      value: zones,
      onRetry: () => ref.invalidate(deliveryZonesProvider),
      builder: (items) {
        if (items.isEmpty) {
          return PageBody(children: [Text(context.tr('parcel_no_zones'))]);
        }
        if (parcelId == null) return _ParcelForm(zones: items);
        return AsyncPage(
          value: ref.watch(parcelDetailsProvider(parcelId!)),
          onRetry: () => ref.invalidate(parcelDetailsProvider(parcelId!)),
          builder: (details) {
            final enabled = amendment
                ? details.actions?.requestAmendment == true
                : details.actions?.edit == true;
            if (!enabled) {
              return PageBody(
                children: [Text(context.tr('parcel_action_unavailable'))],
              );
            }
            return _ParcelForm(
              key: ValueKey('${details.parcel.id}:${details.parcel.revision}'),
              zones: items,
              parcel: details.parcel,
              amendment: amendment,
            );
          },
        );
      },
    );
  }
}

class _ParcelForm extends ConsumerStatefulWidget {
  const _ParcelForm({
    super.key,
    required this.zones,
    this.parcel,
    this.amendment = false,
  });
  final List<Zone> zones;
  final Parcel? parcel;
  final bool amendment;
  @override
  ConsumerState<_ParcelForm> createState() => _ParcelFormState();
}

class _ParcelFormState extends ConsumerState<_ParcelForm> {
  final _form = GlobalKey<FormState>();
  final _controllers = <String, TextEditingController>{};
  late final ParcelSubmission _submission;
  String? _zoneId;
  String _mode = 'COD';
  GeoPin? _pin;
  PricingPreview? _preview;
  Json? _pendingInput;
  bool _busy = false, _pricing = false;
  bool _submitted = false;
  int _priceRequest = 0;
  Object? _error, _priceError;
  bool get _locked => _pendingInput != null || _busy;

  @override
  void initState() {
    super.initState();
    _submission = ref.read(
      parcelSubmissionProvider(
        '${widget.parcel?.id ?? 'new'}:${widget.amendment}',
      ),
    );
    _pendingInput = _submission.pending;
    final p = widget.parcel;
    final initial = <String, String>{
      'recipientName': p?.recipientName ?? '',
      'recipientPhone': p?.recipientPhone ?? '',
      'secondaryPhone': p?.secondaryPhone ?? '',
      'destination': p?.destination ?? '',
      'amount': p?.finalCustomerAmount ?? '',
      'description': p?.description ?? '',
      'pieces': '${p?.pieces ?? 1}',
      'reference': p?.merchantReference ?? '',
      'notes': p?.customerNotes ?? '',
      'reason': '',
    };
    for (final entry in initial.entries) {
      _controllers[entry.key] = TextEditingController(text: entry.value);
    }
    _zoneId = p?.deliveryZoneId;
    _mode = p?.collectionMode ?? 'COD';
    if (p?.latitude != null && p?.longitude != null) {
      _pin = GeoPin(p!.latitude!, p.longitude!);
    }
    final pending = _pendingInput;
    if (pending != null) {
      for (final name in _controllers.keys) {
        final key = switch (name) {
          'amount' => 'finalCustomerAmount',
          'reference' => 'merchantReference',
          _ => name,
        };
        _controllers[name]!.text = pending[key]?.toString() ?? '';
      }
      _zoneId = pending['zoneId'] as String?;
      _mode = pending['collectionMode'] as String? ?? 'COD';
      final lat = pending['latitude'];
      final lng = pending['longitude'];
      if (lat is double && lng is double) _pin = GeoPin(lat, lng);
    }
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  String _text(String field) => _controllers[field]!.text.trim();
  Zone? get _zone {
    for (final zone in widget.zones) {
      if (zone.id == _zoneId) return zone;
    }
    return null;
  }

  ParcelDraft? get _draft {
    final zone = _zone;
    if (zone == null) return null;
    return ParcelDraft(
      recipientName: _text('recipientName'),
      recipientPhone: _text('recipientPhone'),
      secondaryPhone: _text('secondaryPhone'),
      destination: _text('destination'),
      zone: zone,
      amount: _text('amount'),
      mode: _mode,
      description: _text('description'),
      pieces: _text('pieces'),
      reference: _text('reference'),
      notes: _text('notes'),
      pin: _pin,
    );
  }

  bool get _currentPrice =>
      _preview != null &&
      _zone != null &&
      priceMatches(_preview!, _zone!.id, _text('amount'));
  void _clearPrice() {
    _preview = null;
    _priceError = null;
    _priceRequest++;
    _pricing = false;
  }

  Future<void> _getPrice() async {
    final zone = _zone;
    final amount = _text('amount');
    if (zone == null || !validAmount(amount, _mode, currency: zone.currency)) {
      _form.currentState?.validate();
      return;
    }
    final request = ++_priceRequest;
    setState(() {
      _pricing = true;
      _preview = null;
      _priceError = null;
    });
    try {
      final preview = await ref.read(apiProvider).preview(zone.id, amount);
      if (!mounted || request != _priceRequest) return;
      if (!priceMatches(preview, zone.id, amount)) {
        throw const ApiFailure(FailureKind.invalidResponse);
      }
      setState(() => _preview = preview);
    } on Object catch (error) {
      if (mounted && request == _priceRequest) {
        setState(() => _priceError = error);
      }
    } finally {
      if (mounted && request == _priceRequest) setState(() => _pricing = false);
    }
  }

  Future<void> _save() async {
    if (_busy) return;
    if (_pendingInput == null) {
      setState(() => _submitted = true);
      if (!(_form.currentState?.validate() ?? false) ||
          _draft == null ||
          _draft!.errors.isNotEmpty ||
          (widget.amendment &&
              (_text('reason').length < 3 || _text('reason').length > 500)) ||
          !_currentPrice) {
        return;
      }
      if (widget.amendment &&
          !await showConfirmation(
            context,
            title: context.tr('parcel_request_amendment'),
            message: context.tr('parcel_amendment_help'),
          )) {
        return;
      }
      if (!mounted) return;
      _pendingInput = _draft!.input(
        _preview!,
        _submission.key,
        revision: widget.parcel?.revision,
        reason: widget.amendment ? _text('reason') : null,
      );
      _submission.pending = _pendingInput;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(apiProvider);
      String id;
      if (widget.amendment) {
        id = widget.parcel!.id;
        await api.amendment(id, _pendingInput!);
      } else if (widget.parcel != null) {
        id = (await api.editParcel(widget.parcel!.id, _pendingInput!)).id;
      } else {
        id = (await api.createParcel(_pendingInput!)).id;
      }
      _submission.complete();
      if (!mounted) return;
      ref.invalidate(parcelsProvider);
      ref.invalidate(parcelDetailsProvider(id));
      ref.invalidate(parcelRequestsProvider(id));
      showSuccess(context);
      context.go('/parcels/$id');
    } on Object catch (error) {
      if (error is ApiFailure &&
          (error.kind == FailureKind.validation ||
              error.kind == FailureKind.conflict ||
              error.kind == FailureKind.forbidden ||
              error.kind == FailureKind.notFound)) {
        _submission.pending = null;
      }
      if (!mounted) return;
      setState(() {
        _error = error;
        // Only definitive validation/conflict responses allow a new draft. An
        // uncertain transport/server failure retains the exact payload and key.
        if (error is ApiFailure &&
            (error.kind == FailureKind.validation ||
                error.kind == FailureKind.conflict ||
                error.kind == FailureKind.forbidden ||
                error.kind == FailureKind.notFound)) {
          _pendingInput = null;
          if (error.kind == FailureKind.conflict) _clearPrice();
        }
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _heading(String key) =>
      Text(context.tr(key), style: Theme.of(context).textTheme.titleMedium);
  Widget _field(
    String name,
    String label, {
    int maxLength = 150,
    int lines = 1,
    TextInputType? keyboard,
    bool ltr = false,
    bool enabled = true,
  }) => TextFormField(
    key: ValueKey(name),
    controller: _controllers[name],
    enabled: !_locked && enabled,
    textDirection: ltr ? TextDirection.ltr : null,
    maxLength: maxLength,
    maxLines: lines,
    keyboardType: keyboard,
    decoration: InputDecoration(
      labelText: name == 'amount' && _zone != null
          ? '${context.tr(label)} (${_zone!.currency})'
          : context.tr(label),
    ),
    onChanged: name == 'amount' ? (_) => setState(_clearPrice) : null,
    validator: (_) {
      if (name == 'reason') {
        return _text(name).length < 3
            ? context.tr('parcel_reason_error')
            : null;
      }
      final key = _draft?.errors[name];
      return key == null ? null : context.tr(key);
    },
  );
  @override
  Widget build(BuildContext context) => Form(
    key: _form,
    child: PageBody(
      children: [
        Text(
          context.tr(
            widget.amendment
                ? 'parcel_request_amendment'
                : widget.parcel != null
                ? 'parcel_edit'
                : 'parcel_create',
          ),
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        Text(
          context.tr(
            widget.amendment ? 'parcel_amendment_help' : 'parcel_create_help',
          ),
        ),
        if (widget.amendment)
          _field('reason', 'parcel_amendment_reason', maxLength: 500, lines: 2),
        _heading('parcel_recipient'),
        _field('recipientName', 'parcel_recipient_name'),
        _field(
          'recipientPhone',
          'parcel_phone',
          maxLength: 30,
          keyboard: TextInputType.phone,
          ltr: true,
        ),
        _field(
          'secondaryPhone',
          'parcel_secondary_phone',
          maxLength: 30,
          keyboard: TextInputType.phone,
          ltr: true,
        ),
        _heading('parcel_destination'),
        DropdownButtonFormField<String>(
          key: const ValueKey('zoneDropdown'),
          initialValue: widget.zones.any((z) => z.id == _zoneId)
              ? _zoneId
              : null,
          isExpanded: true,
          decoration: InputDecoration(labelText: context.tr('parcel_zone')),
          items: [
            for (final zone in widget.zones)
              DropdownMenuItem(
                value: zone.id,
                child: Text('${zone.city} · ${zone.name}'),
              ),
          ],
          validator: (_) =>
              _zone == null ? context.tr('parcel_zone_error') : null,
          onChanged: _locked
              ? null
              : (value) => setState(() {
                  _zoneId = value;
                  _clearPrice();
                }),
        ),
        _field('destination', 'parcel_address', maxLength: 500, lines: 3),
        PinField(
          value: _pin,
          enabled: !_locked,
          onChanged: (pin) => setState(() => _pin = pin),
        ),
        _heading('parcel_payment'),
        DropdownButtonFormField<String>(
          key: const ValueKey('modeDropdown'),
          initialValue: _mode,
          decoration: InputDecoration(
            labelText: context.tr('parcel_collection_mode'),
          ),
          items: [
            for (final mode in ['COD', 'PREPAID'])
              DropdownMenuItem(
                value: mode,
                child: Text(context.tr('status_$mode')),
              ),
          ],
          onChanged: _locked
              ? null
              : (value) => setState(() {
                  _mode = value!;
                  if (_mode == 'PREPAID') _controllers['amount']!.text = '0';
                  _clearPrice();
                }),
        ),
        _field(
          'amount',
          'parcel_final_amount',
          maxLength: 18,
          keyboard: const TextInputType.numberWithOptions(decimal: true),
          ltr: true,
          enabled: _mode != 'PREPAID',
        ),
        Text(context.tr('parcel_inclusive_help')),
        if (_mode == 'PREPAID') Text(context.tr('parcel_prepaid_help')),
        OutlinedButton(
          onPressed: _locked || _pricing ? null : _getPrice,
          child: Text(
            context.tr(_pricing ? 'loading' : 'parcel_preview_price'),
          ),
        ),
        if (_priceError != null) ErrorNotice(error: _priceError!),
        if (_currentPrice) PricingSummary(preview: _preview!),
        _heading('parcel_package'),
        _field('description', 'parcel_description', maxLength: 1000, lines: 2),
        _field(
          'pieces',
          'parcel_pieces',
          maxLength: 4,
          keyboard: TextInputType.number,
          ltr: true,
        ),
        _field('reference', 'parcel_reference', maxLength: 100),
        _field('notes', 'parcel_notes', maxLength: 1000, lines: 3),
        if (_submitted && _draft != null && _draft!.errors.isNotEmpty)
          Text(
            _draft!.errors.values.map(context.tr).join('\n'),
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        if (!_currentPrice && _pendingInput == null)
          Text(context.tr('parcel_price_required')),
        if (_pendingInput != null && !_busy)
          Text(context.tr('parcel_uncertain_write')),
        if (_error != null) ErrorNotice(error: _error!),
        SubmitButton(
          busy: _busy,
          onPressed: _pendingInput != null || _currentPrice ? _save : null,
          label: context.tr(
            _pendingInput != null
                ? 'parcel_retry_write'
                : widget.amendment
                ? 'parcel_send_amendment'
                : widget.parcel != null
                ? 'parcel_save'
                : 'parcel_create',
          ),
        ),
      ],
    ),
  );
}
