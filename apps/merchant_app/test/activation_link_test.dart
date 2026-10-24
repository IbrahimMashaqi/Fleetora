import 'package:flutter_test/flutter_test.dart';
import 'package:fleetora_merchant/features/auth/activation_link.dart';

void main() {
  test(
    'only the approved activation handoff and one bounded token are accepted',
    () {
      final token = List.filled(43, 'a').join();
      for (final length in [43, 64]) {
        final validToken = List.filled(length, 'a').join();
        expect(
          nativeActivationRoute(
            Uri.parse('fleetora-merchant://app/activate?token=$validToken'),
          ),
          '/activate?token=$validToken',
        );
      }
      for (final value in [
        'malformed',
        'https://app/activate?token=$token',
        'fleetora-merchant://activate?token=$token',
        'fleetora-merchant://other/activate?token=$token',
        'fleetora-merchant://app/activate?token=$token&token=$token',
        'fleetora-merchant://app/activate?token=$token&companyId=x',
        'fleetora-merchant://app/activate?token=short',
        'fleetora-merchant://app/activate?token=$token#fragment',
      ]) {
        expect(nativeActivationRoute(Uri.parse(value)), isNull);
      }
    },
  );
}
