import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fleetora_merchant/app/app.dart';
import 'package:fleetora_merchant/app/localization/generated/app_localizations.dart';
import 'package:fleetora_merchant/core/authentication/session.dart';
import 'package:fleetora_merchant/core/errors/api_failure.dart';
import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:fleetora_merchant/core/networking/api_client.dart';
import 'package:fleetora_merchant/core/networking/merchant_api.dart';
import 'package:fleetora_merchant/core/config/app_config.dart';
import 'package:fleetora_merchant/features/bulk_import/import_page.dart';

import 'auth_navigation_test.dart' show identity;
import 'support/api_test_support.dart' show MemoryTokens;

class ResumeApi extends MerchantApi {
  ResumeApi(this.completion)
    : super(
        ApiClient(
          AppConfig('https://fixture.example'),
          MemoryTokens()
            ..value = const Tokens(
              accessToken: 'fixture-access',
              refreshToken: 'fixture-refresh',
            ),
        ),
      );
  final Completer<MerchantContext> completion;
  int calls = 0;
  @override
  Future<MerchantContext> me() async =>
      calls++ == 0 ? identity('owner', owner: true) : completion.future;
}

void main() {
  testWidgets(
    'slow identity revalidation preserves import route and mounted file workflow',
    (tester) async {
      final completion = Completer<MerchantContext>();
      final api = ResumeApi(completion);
      final container = ProviderContainer(
        overrides: [
          clientProvider.overrideWithValue(api.client),
          apiProvider.overrideWithValue(api),
        ],
      );
      addTearDown(() {
        container.dispose();
        api.client.dispose();
      });
      await container.read(sessionProvider.future);
      final router = container.read(routerProvider);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(
            routerConfig: router,
            locale: const Locale('en'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
          ),
        ),
      );
      router.go('/imports');
      await tester.pumpAndSettle();
      final mountedState = tester.state(find.byType(ImportPage));
      final refresh = container
          .read(sessionProvider.notifier)
          .refreshIdentity();
      await tester.pump();
      expect(container.read(sessionProvider).hasValue, true);
      expect(router.routeInformationProvider.value.uri.path, '/imports');
      expect(tester.state(find.byType(ImportPage)), same(mountedState));
      completion.complete(identity('owner', owner: true));
      await refresh;
      await tester.pumpAndSettle();
      expect(container.read(routerProvider), same(router));
      expect(router.routeInformationProvider.value.uri.path, '/imports');
      expect(tester.state(find.byType(ImportPage)), same(mountedState));
    },
  );
  test('late identity failure cannot overwrite a signed-out session', () async {
    final completion = Completer<MerchantContext>();
    final api = ResumeApi(completion);
    final container = ProviderContainer(
      overrides: [
        clientProvider.overrideWithValue(api.client),
        apiProvider.overrideWithValue(api),
      ],
    );
    addTearDown(() {
      container.dispose();
      api.client.dispose();
    });
    await container.read(sessionProvider.future);
    final refresh = container.read(sessionProvider.notifier).refreshIdentity();
    await api.client.clear();
    completion.completeError(const ApiFailure(FailureKind.sessionChanged));
    await refresh;
    expect(container.read(sessionProvider).hasError, false);
    expect(container.read(sessionProvider).asData?.value, isNull);
  });
}
