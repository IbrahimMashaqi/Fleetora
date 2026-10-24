import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/authentication/session.dart';
import '../../core/networking/merchant_api.dart';
import '../../core/networking/models.dart';

final pickupRepositoryProvider = Provider<PickupRepository>(
  (ref) => PickupRepository(ref.watch(apiProvider)),
);
final pickupsProvider = FutureProvider.autoDispose
    .family<PageResult<Pickup>, int>(
      (ref, page) => ref.watch(pickupRepositoryProvider).list(page),
    );
final pickupDetailsProvider = FutureProvider.autoDispose.family<Pickup, String>(
  (ref, id) => ref.watch(pickupRepositoryProvider).details(id),
);
final readyParcelsProvider = FutureProvider.autoDispose
    .family<PageResult<Parcel>, int>(
      (ref, page) => ref.watch(pickupRepositoryProvider).ready(page),
    );

class PickupRepository {
  PickupRepository(this.api);
  final MerchantApi api;
  Future<PageResult<Pickup>> list(int page) => api.pickups(page: page);
  Future<Pickup> details(String id) => api.pickup(id);
  Future<PageResult<Parcel>> ready(int page) async {
    final result = await api.parcels(page: page, status: 'CREATED');
    return PageResult(
      items: result.items.where(isReadyForPickup).toList(growable: false),
      page: result.page,
      pageSize: result.pageSize,
      hasNext: result.hasNext,
    );
  }

  Future<Pickup> create(Json input) => api.createPickup(input);
  Future<Pickup> action(Pickup pickup, String action) =>
      api.pickupAction(pickup.id, pickup.revision, action);
}

bool isReadyForPickup(Parcel parcel) =>
    parcel.status == 'CREATED' && parcel.custody == 'MERCHANT';

bool canCancelPickup(Pickup pickup) =>
    !{'CANCELLED', 'RECEIVED'}.contains(pickup.status) &&
    pickup.parcels != null &&
    pickup.parcels!.every((parcel) => parcel.receipt == 'PENDING');

bool validPreferredWindow(DateTime? from, DateTime? to, DateTime now) =>
    from != null && to != null && from.isAfter(now) && to.isAfter(from);
