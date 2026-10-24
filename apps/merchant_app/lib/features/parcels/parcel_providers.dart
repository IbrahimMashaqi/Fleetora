import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../core/authentication/session.dart';
import '../../core/errors/api_failure.dart';
import '../../core/networking/merchant_api.dart';
import '../../core/networking/models.dart';

/// Authenticated-container lifetime: reopening an uncertain form keeps its
/// request identity. Changing the signed-in account disposes this store.
class ParcelSubmission {
  String key = const Uuid().v4();
  Json? pending;
  void complete() {
    pending = null;
    key = const Uuid().v4();
  }
}

final parcelSubmissionProvider = Provider.family<ParcelSubmission, String>(
  (ref, target) => ParcelSubmission(),
);

typedef CancellationInput = ({bool request, int revision, String reason});

class CancellationSubmission {
  String key = const Uuid().v4();
  CancellationInput? pending;
  void complete() {
    pending = null;
    key = const Uuid().v4();
  }
}

final cancellationSubmissionProvider =
    Provider.family<CancellationSubmission, String>(
      (ref, id) => CancellationSubmission(),
    );

typedef ParcelQuery = ({int page, String search, String? status});

// Riverpod retries provider exceptions by default. A permanent API response
// needs explicit user refresh; only transient reads retain the default backoff.
Duration? _retryParcelRead(int retryCount, Object error) {
  if (error is ApiFailure &&
      error.kind != FailureKind.network &&
      error.kind != FailureKind.server) {
    return null;
  }
  return ProviderContainer.defaultRetry(retryCount, error);
}

final parcelsProvider = FutureProvider.autoDispose
    .family<PageResult<Parcel>, ParcelQuery>(
      (ref, query) => ref
          .watch(apiProvider)
          .parcels(
            page: query.page,
            search: query.search,
            status: query.status,
          ),
    );
final parcelDetailsProvider = FutureProvider.autoDispose
    .family<ParcelDetails, String>(
      (ref, id) => ref.watch(apiProvider).parcel(id),
      retry: _retryParcelRead,
    );
final parcelRequestsProvider = FutureProvider.autoDispose
    .family<List<ParcelRequest>, String>(
      (ref, id) => ref.watch(apiProvider).parcelRequests(id),
      retry: _retryParcelRead,
    );
final deliveryZonesProvider = FutureProvider.autoDispose<List<Zone>>(
  (ref) => ref.watch(apiProvider).zones(),
);
