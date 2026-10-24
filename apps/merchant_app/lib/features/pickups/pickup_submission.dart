import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/errors/api_failure.dart';
import '../../core/networking/merchant_api.dart';
import '../../core/networking/models.dart';
import 'pickup_repository.dart';

class PendingPickup {
  factory PendingPickup(Json fields) {
    final parcelIds = fields['parcelIds'];
    if (parcelIds is! List<String>) {
      throw ArgumentError('Parcel IDs are required');
    }
    return PendingPickup._(
      Map<String, Object?>.unmodifiable({
        ...fields,
        'parcelIds': List<String>.unmodifiable(parcelIds),
        'idempotencyKey': const Uuid().v4(),
      }),
    );
  }
  const PendingPickup._(this.payload);
  final Json payload;
}

class PickupSubmissionState {
  const PickupSubmissionState({this.pending, this.busy = false, this.error});
  final PendingPickup? pending;
  final bool busy;
  final Object? error;
}

/// Lives in the authenticated container, so leaving a route cannot replace an uncertain write.
final pickupSubmissionProvider =
    NotifierProvider<PickupSubmissionController, PickupSubmissionState>(
      PickupSubmissionController.new,
    );

class PickupSubmissionController extends Notifier<PickupSubmissionState> {
  @override
  PickupSubmissionState build() => const PickupSubmissionState();

  Future<Pickup?> start(Json fields) {
    if (state.busy || state.pending != null) {
      throw StateError(
        'Resolve the existing pickup request before starting another',
      );
    }
    state = PickupSubmissionState(pending: PendingPickup(fields));
    return retry();
  }

  Future<Pickup?> retry() async {
    final pending = state.pending;
    if (state.busy || pending == null) return null;
    state = PickupSubmissionState(pending: pending, busy: true);
    try {
      final pickup = await ref
          .read(pickupRepositoryProvider)
          .create(pending.payload);
      if (ref.mounted) {
        state = const PickupSubmissionState();
        ref.invalidate(pickupsProvider);
        ref.invalidate(readyParcelsProvider);
      }
      return pickup;
    } on Object catch (error) {
      if (ref.mounted) {
        final rejected =
            error is ApiFailure &&
            {
              FailureKind.validation,
              FailureKind.forbidden,
              FailureKind.notFound,
              FailureKind.conflict,
            }.contains(error.kind);
        state = PickupSubmissionState(
          pending: rejected ? null : pending,
          error: error,
        );
      }
      return null;
    }
  }
}
