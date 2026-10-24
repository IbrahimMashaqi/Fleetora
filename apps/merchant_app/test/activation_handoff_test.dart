import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fleetora_merchant/app/app.dart';
import 'package:fleetora_merchant/app/localization/generated/app_localizations.dart';
import 'package:fleetora_merchant/core/authentication/session.dart';
import 'package:fleetora_merchant/core/config/app_config.dart';
import 'package:fleetora_merchant/core/networking/api_client.dart';
import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:fleetora_merchant/features/auth/auth_pages.dart';

import 'support/api_test_support.dart' show MemoryTokens;

class RestoringTokens extends MemoryTokens {
  RestoringTokens(this.completion);
  final Completer<Tokens?> completion;
  @override
  Future<Tokens?> read() => completion.future;
}

void main() {
  testWidgets(
    'activation handoff survives slow restoration and removes its URL token',
    (tester) async {
      final restoration = Completer<Tokens?>();
      final client = ApiClient(
        AppConfig('https://fixture.example'),
        RestoringTokens(restoration),
      );
      final container = ProviderContainer(
        overrides: [clientProvider.overrideWithValue(client)],
      );
      addTearDown(() {
        if (!restoration.isCompleted) restoration.complete(null);
        container.dispose();
        client.dispose();
      });
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
      router.go('/activate?token=${List.filled(43, 'a').join()}');
      await tester.pump();
      await tester.pump();
      expect(find.byType(ActivationPage), findsOneWidget);
      expect(
        router.routeInformationProvider.value.uri.queryParameters.containsKey(
          'token',
        ),
        false,
      );
      restoration.complete(null);
      await tester.pumpAndSettle();
      expect(find.byType(ActivationPage), findsOneWidget);
      expect(
        tester
            .widget<TextFormField>(find.byType(TextFormField).first)
            .controller!
            .text
            .length,
        43,
      );
    },
  );
}
