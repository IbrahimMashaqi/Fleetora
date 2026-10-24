import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:fleetora_merchant/app/localization/generated/app_localizations.dart';
import 'package:fleetora_merchant/features/auth/auth_pages.dart';

// Device interaction smoke test. This is not a substitute for the actual
// Flutter/Nest/PostgreSQL/company dashboard browser integration suite.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'native Arabic keyboard form rejects invalid signin without a write',
    (tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            locale: Locale('ar'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: LoginPage(),
          ),
        ),
      );
      await tester.enterText(find.byType(TextFormField).first, 'invalid-email');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.tap(find.widgetWithText(FilledButton, 'تسجيل الدخول'));
      await tester.pumpAndSettle();
      expect(find.text('أدخل بريدًا إلكترونيًا صالحًا'), findsOneWidget);
      expect(find.text('هذا الحقل مطلوب'), findsOneWidget);
    },
  );
}
