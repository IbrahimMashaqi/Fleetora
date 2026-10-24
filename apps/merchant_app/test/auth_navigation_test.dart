import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fleetora_merchant/app/app.dart';
import 'package:fleetora_merchant/app/localization/generated/app_localizations.dart';
import 'package:fleetora_merchant/app/merchant_scope.dart';
import 'package:fleetora_merchant/core/authentication/session.dart';
import 'package:fleetora_merchant/core/config/app_config.dart';
import 'package:fleetora_merchant/core/networking/api_client.dart';
import 'package:fleetora_merchant/core/networking/merchant_api.dart';
import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:fleetora_merchant/features/auth/auth_pages.dart';

import 'support/api_test_support.dart' show MemoryTokens;

MerchantContext identity(
  String id, {
  bool owner = false,
  List<String> permissions = const [],
}) => MerchantContext(
  userId: id,
  merchantId: id,
  companyId: id,
  membershipId: id,
  owner: owner,
  permissions: permissions,
  merchant: Business(
    id: id,
    name: id,
    pickupAddress: 'Address',
    city: 'City',
    phone: '000',
  ),
  company: Company(id: id, name: id),
);
Widget localized(Widget child, {String locale = 'en'}) => MaterialApp(
  locale: Locale(locale),
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: child,
);

class FakeSession extends SessionController {
  int calls = 0;
  @override
  Future<MerchantContext?> build() async => null;
  @override
  Future<void> signIn(String email, String password) async {
    calls++;
  }
}

class ControlledApi extends MerchantApi {
  ControlledApi(this.result)
    : super(ApiClient(AppConfig('https://fixture.example'), MemoryTokens()));
  final Completer<MerchantContext> result;
  @override
  Future<MerchantContext> me() => result.future;
}

final scopedRead = FutureProvider<MerchantContext>(
  (ref) => ref.watch(apiProvider).me(),
);

class ScopedView extends ConsumerWidget {
  const ScopedView({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      Text(ref.watch(scopedRead).asData?.value.merchant.name ?? 'loading');
}

void main() {
  test(
    'permission-aware routes do not grant staff finances or administration',
    () {
      final employee = identity(
        'staff',
        permissions: ['PARCEL_VIEW', 'PARCEL_CREATE'],
      );
      expect(routeAllowed(employee, '/parcels'), true);
      expect(routeAllowed(employee, '/parcels/new'), true);
      for (final path in [
        '/accounting',
        '/settlements',
        '/users',
        '/activity',
        '/imports',
        '/pickups',
        '/parcels/a/edit',
      ]) {
        expect(routeAllowed(employee, path), false, reason: path);
      }
      expect(routeAllowed(identity('owner', owner: true), '/users'), true);
    },
  );
  testWidgets('login validates inputs and supports Arabic RTL', (tester) async {
    final controller = FakeSession();
    await tester.pumpWidget(
      ProviderScope(
        overrides: [sessionProvider.overrideWith(() => controller)],
        child: localized(const LoginPage(), locale: 'ar'),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      Directionality.of(tester.element(find.byType(Form))),
      TextDirection.rtl,
    );
    await tester.tap(find.widgetWithText(FilledButton, 'تسجيل الدخول'));
    await tester.pump();
    expect(find.text('أدخل بريدًا إلكترونيًا صالحًا'), findsOneWidget);
    expect(controller.calls, 0);
    await tester.enterText(
      find.byType(TextFormField).at(0),
      'merchant@example.invalid',
    );
    await tester.enterText(
      find.byType(TextFormField).at(1),
      'fixture-password',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'تسجيل الدخول'));
    await tester.pumpAndSettle();
    expect(controller.calls, 1);
  });
  testWidgets('activation validates invitation and password without a write', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(child: localized(const ActivationPage())),
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Activate account'));
    await tester.pump();
    expect(find.text('This field is required'), findsNWidgets(2));
    expect(find.text('Use at least 8 characters'), findsOneWidget);
  });
  testWidgets('switching merchant discards cached and late responses', (
    tester,
  ) async {
    final old = Completer<MerchantContext>(),
        next = Completer<MerchantContext>();
    final oldApi = ControlledApi(old), newApi = ControlledApi(next);
    await tester.pumpWidget(
      localized(
        MerchantScope(
          key: const ValueKey('old'),
          merchant: identity('old'),
          api: oldApi,
          child: const ScopedView(),
        ),
      ),
    );
    await tester.pump();
    await tester.pumpWidget(
      localized(
        MerchantScope(
          key: const ValueKey('new'),
          merchant: identity('new'),
          api: newApi,
          child: const ScopedView(),
        ),
      ),
    );
    next.complete(identity('new'));
    await tester.pumpAndSettle();
    expect(find.text('new'), findsOneWidget);
    old.complete(identity('old'));
    await tester.pumpAndSettle();
    expect(find.text('old'), findsNothing);
    expect(find.text('new'), findsOneWidget);
    oldApi.client.dispose();
    newApi.client.dispose();
  });
}
