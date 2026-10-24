import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/copy.dart';
import '../../core/authentication/session.dart';
import '../../core/networking/models.dart';
import '../../core/widgets/feedback.dart';
import 'pickup_repository.dart';
import 'pickups_page.dart';

class PickupDetailsPage extends ConsumerStatefulWidget {
  const PickupDetailsPage({super.key, required this.id});
  final String id;
  @override
  ConsumerState<PickupDetailsPage> createState() => _PickupDetailsPageState();
}

class _PickupDetailsPageState extends ConsumerState<PickupDetailsPage> {
  bool _busy = false;
  Future<void> _action(Pickup pickup, String action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final confirmed = await showConfirmation(
        context,
        title: context.tr(
          action == 'CANCEL' ? 'pickup_cancel' : 'pickup_accept',
        ),
        message: context.tr(
          action == 'CANCEL' ? 'pickup_cancelMessage' : 'pickup_acceptMessage',
        ),
      );
      if (!confirmed || !mounted) return;
      await ref.read(pickupRepositoryProvider).action(pickup, action);
      ref.invalidate(pickupsProvider);
      ref.invalidate(pickupDetailsProvider(widget.id));
      if (mounted) showSuccess(context);
    } on Object catch (error) {
      // Reload revision and state before any explicit retry of a consequential action.
      ref.invalidate(pickupDetailsProvider(widget.id));
      if (mounted) showFailure(context, error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final merchant = ref.watch(merchantProvider);
    if (!allowed(merchant, 'PICKUP_MANAGE')) {
      return PageBody(children: [Text(context.tr('pickup_denied'))]);
    }
    return AsyncPage(
      value: ref.watch(pickupDetailsProvider(widget.id)),
      onRetry: () => ref.invalidate(pickupDetailsProvider(widget.id)),
      builder: (pickup) => PageBody(
        children: [
          Text(
            context.tr('pickup_details'),
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          StatusBadge(pickup.status),
          Text(context.tr('pickup_method_${pickup.method}')),
          Text(pickup.pickupAddress),
          Text(context.tr('pickup_receiptNotice')),
          for (final window in [
            (
              label: 'pickup_preferred',
              from: pickup.preferredFrom,
              to: pickup.preferredTo,
            ),
            (
              label: 'pickup_proposed',
              from: pickup.proposedFrom,
              to: pickup.proposedTo,
            ),
            (
              label: 'pickup_confirmed',
              from: pickup.confirmedFrom,
              to: pickup.confirmedTo,
            ),
          ])
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(context.tr(window.label)),
              subtitle: Text(
                '${pickupTime(context, window.from)} — ${pickupTime(context, window.to)}',
              ),
            ),
          if (pickup.notes?.isNotEmpty ?? false) Text(pickup.notes!),
          Text(
            context.tr('pickup_parcels'),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          for (final parcel in pickup.parcels ?? <PickupParcel>[])
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(parcel.shipmentId, textDirection: TextDirection.ltr),
              subtitle: Text(context.tr('pickup_receipt_${parcel.receipt}')),
              trailing: allowed(merchant, 'PARCEL_VIEW')
                  ? const Icon(Icons.chevron_right)
                  : null,
              onTap: allowed(merchant, 'PARCEL_VIEW')
                  ? () => context.push(
                      '/parcels/${Uri.encodeComponent(parcel.shipmentId)}',
                    )
                  : null,
            ),
          if (pickup.status == 'PROPOSED' &&
              pickup.proposedFrom != null &&
              pickup.proposedTo != null)
            SubmitButton(
              busy: _busy,
              onPressed: () => _action(pickup, 'ACCEPT_PROPOSAL'),
              label: context.tr('pickup_accept'),
            ),
          if (canCancelPickup(pickup))
            OutlinedButton(
              onPressed: _busy ? null : () => _action(pickup, 'CANCEL'),
              child: Text(context.tr('pickup_cancel')),
            ),
          TextButton(
            onPressed: _busy
                ? null
                : () => ref.invalidate(pickupDetailsProvider(widget.id)),
            child: Text(context.tr('pickup_refresh')),
          ),
        ],
      ),
    );
  }
}
