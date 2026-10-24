import 'package:fleetora_merchant/core/authentication/token_store.dart';
import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const tokens = Tokens(
    accessToken: 'fixture-access',
    refreshToken: 'fixture-refresh',
  );
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test(
    'device credentials are isolated by API origin and survive a new store',
    () async {
      final first = DeviceTokenStore('https://first.example.invalid');
      final other = DeviceTokenStore('https://other.example.invalid');
      await first.write(tokens);
      expect(await other.read(), isNull);
      expect(
        (await DeviceTokenStore(
          'https://first.example.invalid',
        ).read())!.accessToken,
        tokens.accessToken,
      );
      await first.clear();
      expect(await first.read(), isNull);
      expect(await other.read(), isNull);
    },
  );

  test(
    'corrupted device credentials are deleted instead of restored',
    () async {
      final store = DeviceTokenStore('https://first.example.invalid');
      const platform = FlutterSecureStorage();
      await store.write(tokens);
      final key = (await platform.readAll()).keys.single;
      for (final invalid in [
        '{invalid',
        '[]',
        '{"accessToken":42,"refreshToken":"fixture"}',
      ]) {
        await platform.write(key: key, value: invalid);
        expect(await store.read(), isNull);
        expect(await platform.readAll(), isEmpty);
      }
    },
  );
}
