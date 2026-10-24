import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../errors/api_failure.dart';
import '../networking/api_client.dart';
import '../networking/merchant_api.dart';
import '../networking/models.dart';
import 'token_store.dart';

final clientProvider = Provider<ApiClient>((ref) {
  final config = AppConfig(AppConfig.configuredUrl);
  final client = ApiClient(config, DeviceTokenStore(config.apiBaseUrl));
  ref.onDispose(client.dispose);
  return client;
});
final apiProvider = Provider<MerchantApi>(
  (ref) => MerchantApi(ref.watch(clientProvider)),
);
final merchantProvider = Provider<MerchantContext>(
  (ref) => throw StateError('Authenticated scope required'),
);
final sessionProvider =
    AsyncNotifierProvider<SessionController, MerchantContext?>(
      SessionController.new,
    );

class SessionController extends AsyncNotifier<MerchantContext?> {
  @override
  Future<MerchantContext?> build() async {
    final client = ref.watch(clientProvider);
    client.onExpired = () {
      if (ref.mounted) state = const AsyncData(null);
    };
    client.onRefreshed = () async {
      final generation = client.generation;
      try {
        final identity = MerchantContext.fromJson(
          objectJson(await client.request('/merchant/me', replayed: true)),
        );
        if (!ref.mounted || generation != client.generation) return;
        state = AsyncData(identity);
      } on Object catch (error) {
        if (!ref.mounted || generation != client.generation) rethrow;
        if (error is ApiFailure &&
            (error.kind == FailureKind.unauthorized ||
                error.kind == FailureKind.forbidden)) {
          await client.clear();
        }
        rethrow;
      }
    };
    if (!await client.restore()) return null;
    return ref.read(apiProvider).me();
  }

  Future<void> signIn(String email, String password) async {
    await ref.read(clientProvider).signIn(email, password);
    final generation = ref.read(clientProvider).generation;
    try {
      final identity = await ref.read(apiProvider).me();
      if (!ref.mounted || generation != ref.read(clientProvider).generation) {
        return;
      }
      state = AsyncData(identity);
    } on Object {
      if (ref.mounted && generation == ref.read(clientProvider).generation) {
        await ref.read(clientProvider).clear();
      }
      rethrow;
    }
  }

  Future<void> logout() async {
    await ref.read(clientProvider).logout();
  }

  Future<void> refreshIdentity() async {
    if (state.asData?.value == null) return;
    final generation = ref.read(clientProvider).generation;
    try {
      final identity = await ref.read(apiProvider).me();
      if (!ref.mounted || generation != ref.read(clientProvider).generation) {
        return;
      }
      state = AsyncData(identity);
    } on ApiFailure catch (error) {
      if (!ref.mounted || generation != ref.read(clientProvider).generation) {
        return;
      }
      if (error.kind == FailureKind.unauthorized ||
          error.kind == FailureKind.forbidden) {
        await ref.read(clientProvider).clear();
      } else {
        return;
      }
    } on Object {
      return;
    }
  }
}

const merchantPermissions = [
  'PARCEL_VIEW',
  'PARCEL_CREATE',
  'PARCEL_EDIT',
  'PARCEL_CANCEL',
  'PARCEL_IMPORT',
  'PICKUP_MANAGE',
  'HISTORY_VIEW',
  'FINANCE_VIEW',
  'SETTLEMENT_REQUEST',
];
bool allowed(MerchantContext merchant, String permission) =>
    merchant.owner || merchant.permissions.contains(permission);
