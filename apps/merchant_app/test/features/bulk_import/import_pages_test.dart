import 'package:fleetora_merchant/app/localization/generated/app_localizations.dart';
import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:fleetora_merchant/features/bulk_import/import_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const pricing = PricingPreview(
  finalCustomerAmount: '150.123',
  baseDeliveryFee: '15.001',
  discount: '0.000',
  promotionDiscount: '0.000',
  deliveryFee: '15.001',
  expectedMerchantProceeds: '135.122',
  currency: 'ILS',
  pricingVersion: 'version',
  deliveryZoneId: 'zone',
  pricingPlanId: 'plan',
  zoneName: 'Ramallah',
  city: 'Ramallah',
  planName: 'Contract',
  feePayer: 'MERCHANT',
);

Widget localized(ImportRow row, String language) => MaterialApp(
  locale: Locale(language),
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: Scaffold(body: ImportPreviewRow(row: row)),
);

void main() {
  testWidgets('preview preserves all server price digits and row identity', (
    tester,
  ) async {
    await tester.pumpWidget(
      localized(
        const ImportRow(rowNumber: 7, errors: [], preview: pricing),
        'en',
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Row 7 — Valid'), findsOneWidget);
    expect(
      find.text('Customer payment (delivery included): 150.123 ILS'),
      findsOneWidget,
    );
    expect(find.text('Delivery fee: 15.001 ILS'), findsOneWidget);
    expect(
      find.text('Expected merchant proceeds: 135.122 ILS'),
      findsOneWidget,
    );
  });
  testWidgets(
    'Arabic row errors retain field context without untranslated backend prose',
    (tester) async {
      await tester.pumpWidget(
        localized(
          const ImportRow(
            rowNumber: 3,
            errors: [
              'recipientPhone: recipientPhone must match the phone expression',
            ],
          ),
          'ar',
        ),
      );
      await tester.pumpAndSettle();
      final error = find.text(
        'هاتف المستلم: قيمة مفقودة أو غير صالحة. صحح هذا الصف وفق تعليمات القالب.',
      );
      expect(error, findsOneWidget);
      expect(Directionality.of(tester.element(error)), TextDirection.rtl);
      expect(find.textContaining('recipientPhone'), findsNothing);
    },
  );
}
