import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/copy.dart';
import '../../core/authentication/session.dart';
import '../../core/location/geo_pin.dart';
import '../../core/location/pin_picker.dart';
import '../../core/networking/models.dart';
import '../../core/widgets/feedback.dart';
import 'pickup_repository.dart';
import 'pickup_submission.dart';
import 'pickups_page.dart';

class PickupFormPage extends ConsumerStatefulWidget {
  const PickupFormPage({super.key});
  @override
  ConsumerState<PickupFormPage> createState() => _PickupFormPageState();
}

class _PickupFormPageState extends ConsumerState<PickupFormPage> {
  final _form = GlobalKey<FormState>();
  final _address = TextEditingController();
  final _notes = TextEditingController();
  final _selected = <String>{};
  int _page = 1;
  String _method = 'COMPANY_PICKUP';
  bool _alternate = false;
  DateTime? _from;
  DateTime? _to;
  GeoPin? _pin;
  String? _validation;
  bool get _editable => !ref.read(pickupSubmissionProvider).busy;

  @override
  void dispose() {
    _address.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _chooseTime(bool start) async {
    final now = DateTime.now();
    final initial = (start ? _from : _to) ?? now.add(const Duration(hours: 1));
    final date = await showDatePicker(
      context: context,
      useRootNavigator: false,
      initialDate: initial.isBefore(now) ? now : initial,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      useRootNavigator: false,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (time == null || !mounted) return;
    setState(() {
      final value = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
      if (start) {
        _from = value;
      } else {
        _to = value;
      }
    });
  }

  Future<void> _submit() async {
    final controller = ref.read(pickupSubmissionProvider.notifier);
    final state = ref.read(pickupSubmissionProvider);
    if (state.busy || state.pending != null) return;
    if (!_form.currentState!.validate()) return;
    if (_selected.isEmpty || _selected.length > 200) {
      setState(() => _validation = 'pickup_chooseParcels');
      return;
    }
    if (_method == 'COMPANY_PICKUP' &&
        !validPreferredWindow(_from, _to, DateTime.now())) {
      setState(() => _validation = 'pickup_windowInvalid');
      return;
    }
    setState(() => _validation = null);
    final pickup = await controller.start({
      'parcelIds': _selected.toList(growable: false),
      'method': _method,
      if (_method == 'COMPANY_PICKUP')
        'preferredFrom': _from!.toUtc().toIso8601String(),
      if (_method == 'COMPANY_PICKUP')
        'preferredTo': _to!.toUtc().toIso8601String(),
      if (_alternate) 'pickupAddress': _address.text.trim(),
      if (_alternate && _pin != null) 'latitude': _pin!.latitude,
      if (_alternate && _pin != null) 'longitude': _pin!.longitude,
      if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
    });
    _openConfirmed(pickup);
  }

  Future<void> _retry() async {
    final pickup = await ref.read(pickupSubmissionProvider.notifier).retry();
    _openConfirmed(pickup);
  }

  void _openConfirmed(Pickup? pickup) {
    if (mounted && pickup != null) {
      showSuccess(context);
      context.go('/pickups/${Uri.encodeComponent(pickup.id)}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final merchant = ref.watch(merchantProvider);
    if (!allowed(merchant, 'PICKUP_MANAGE')) {
      return PageBody(children: [Text(context.tr('pickup_denied'))]);
    }
    final submission = ref.watch(pickupSubmissionProvider);
    final pending = submission.pending;
    if (pending != null) {
      final payload = pending.payload;
      return PageBody(
        children: [
          Text(
            context.tr('pickup_details'),
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          Text(context.tr('pickup_uncertain')),
          Text(context.tr('pickup_receiptNotice')),
          if (payload['method'] case final String method)
            Text(context.tr('pickup_method_$method')),
          Text(
            payload['pickupAddress'] is String
                ? payload['pickupAddress']! as String
                : merchant.merchant.pickupAddress,
          ),
          if (payload['preferredFrom'] case final String from)
            Text('${context.tr('pickup_from')}: ${pickupTime(context, from)}'),
          if (payload['preferredTo'] case final String to)
            Text('${context.tr('pickup_to')}: ${pickupTime(context, to)}'),
          if (payload['notes'] case final String notes) Text(notes),
          if (submission.error != null) ErrorNotice(error: submission.error!),
          SubmitButton(
            busy: submission.busy,
            onPressed: _retry,
            label: context.tr('pickup_retrySame'),
          ),
          TextButton(
            onPressed: () => context.go('/pickups'),
            child: Text(context.tr('pickup_title')),
          ),
          Text(
            context.tr('pickup_parcels'),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          if (payload['parcelIds'] case final List<String> ids)
            for (final id in ids) Text(id, textDirection: TextDirection.ltr),
        ],
      );
    }
    return Form(
      key: _form,
      child: PageBody(
        children: [
          Text(
            context.tr('pickup_new'),
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          Text(context.tr('pickup_receiptNotice')),
          DropdownButtonFormField<String>(
            initialValue: _method,
            decoration: InputDecoration(labelText: context.tr('pickup_method')),
            items: ['COMPANY_PICKUP', 'WAREHOUSE_DROPOFF']
                .map(
                  (method) => DropdownMenuItem(
                    value: method,
                    child: Text(context.tr('pickup_method_$method')),
                  ),
                )
                .toList(),
            onChanged: _editable
                ? (value) => setState(() => _method = value!)
                : null,
          ),
          if (_method == 'COMPANY_PICKUP') ...[
            Text(context.tr('pickup_preferenceNotice')),
            OutlinedButton.icon(
              onPressed: _editable ? () => _chooseTime(true) : null,
              icon: const Icon(Icons.calendar_today_outlined),
              label: Text(
                '${context.tr('pickup_from')}: ${pickupTime(context, _from?.toIso8601String())}',
              ),
            ),
            OutlinedButton.icon(
              onPressed: _editable ? () => _chooseTime(false) : null,
              icon: const Icon(Icons.schedule),
              label: Text(
                '${context.tr('pickup_to')}: ${pickupTime(context, _to?.toIso8601String())}',
              ),
            ),
          ],
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _alternate,
            title: Text(context.tr('pickup_alternate')),
            subtitle: Text(
              _alternate
                  ? context.tr('pickup_alternateNotice')
                  : merchant.merchant.pickupAddress,
            ),
            onChanged: _editable
                ? (value) => setState(() {
                    _alternate = value;
                    _pin = null;
                  })
                : null,
          ),
          if (_alternate) ...[
            TextFormField(
              controller: _address,
              enabled: _editable,
              minLines: 2,
              maxLines: 3,
              maxLength: 500,
              decoration: InputDecoration(
                labelText: context.tr('pickup_address'),
              ),
              validator: (value) => value == null || value.trim().length < 3
                  ? context.tr('pickup_addressInvalid')
                  : null,
            ),
            PinField(
              value: _pin,
              enabled: _editable,
              onChanged: (pin) => setState(() => _pin = pin),
            ),
          ],
          TextFormField(
            controller: _notes,
            enabled: _editable,
            maxLength: 1000,
            minLines: 2,
            maxLines: 4,
            decoration: InputDecoration(labelText: context.tr('pickup_notes')),
          ),
          Text(
            '${context.tr('pickup_parcels')} (${_selected.length}/200)',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          Text(context.tr('pickup_readyNotice')),
          if (!allowed(merchant, 'PARCEL_VIEW'))
            Text(context.tr('pickup_parcelPermission'))
          else
            AsyncPage(
              value: ref.watch(readyParcelsProvider(_page)),
              onRetry: () => ref.invalidate(readyParcelsProvider(_page)),
              builder: (result) => Column(
                children: [
                  if (result.items.isEmpty) const EmptyNotice(),
                  for (final parcel in result.items)
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _selected.contains(parcel.id),
                      title: Text(
                        parcel.trackingNumber,
                        textDirection: TextDirection.ltr,
                      ),
                      subtitle: Text(
                        '${parcel.recipientName} · ${parcel.city}',
                      ),
                      onChanged:
                          _editable &&
                              (_selected.length < 200 ||
                                  _selected.contains(parcel.id))
                          ? (value) => setState(() {
                              if (value == true) {
                                _selected.add(parcel.id);
                              } else {
                                _selected.remove(parcel.id);
                              }
                            })
                          : null,
                    ),
                  Pager(
                    page: result.page,
                    hasNext: result.hasNext,
                    onPage: (page) => setState(() => _page = page),
                  ),
                ],
              ),
            ),
          if (_validation != null)
            Semantics(
              liveRegion: true,
              child: Text(
                context.tr(_validation!),
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          if (submission.error != null) ErrorNotice(error: submission.error!),
          SubmitButton(
            busy: submission.busy,
            onPressed: allowed(merchant, 'PARCEL_VIEW') ? _submit : null,
            label: context.tr('pickup_submit'),
          ),
        ],
      ),
    );
  }
}
