import 'package:fleetora_merchant/app/localization/generated/app_localizations.dart';
import 'package:fleetora_merchant/core/authentication/session.dart';
import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:fleetora_merchant/features/pickups/pickup_form_page.dart';
import 'package:fleetora_merchant/features/pickups/pickup_repository.dart';
import 'package:fleetora_merchant/features/pickups/pickups_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

MerchantContext merchant({bool owner = true}) => MerchantContext(
  userId: 'user',
  merchantId: 'merchant',
  companyId: 'company',
  membershipId: 'membership',
  owner: owner,
  permissions: [],
  merchant: const Business(
    id: 'merchant',
    name: 'Shop',
    pickupAddress: 'Main street',
    city: 'Ramallah',
    phone: '0599000000',
  ),
  company: const Company(id: 'company', name: 'Company'),
);

Widget localized(Widget child, {bool owner = true, String language = 'en'}) =>
    ProviderScope(
      overrides: [
        merchantProvider.overrideWithValue(merchant(owner: owner)),
        readyParcelsProvider(1).overrideWith(
          (ref) async => const PageResult<Parcel>(
            items: [],
            page: 1,
            pageSize: 25,
            hasNext: false,
          ),
        ),
      ],
      child: MaterialApp(
        locale: Locale(language),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(body: child),
      ),
    );

void main() {
  testWidgets(
    'denies employees without pickup permission before fetching data',
    (tester) async {
      await tester.pumpWidget(localized(const PickupsPage(), owner: false));
      await tester.pumpAndSettle();
      expect(
        find.text('You do not have permission to manage pickup requests.'),
        findsOneWidget,
      );
      expect(find.text('New pickup request'), findsNothing);
    },
  );
  testWidgets(
    'warehouse drop-off skips appointment preference and requires a selected parcel',
    (tester) async {
      await tester.pumpWidget(localized(const PickupFormPage()));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Warehouse drop-off').last);
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Choose a future time window. This is a preference until the company confirms it.',
        ),
        findsNothing,
      );
      expect(
        find.text(
          'Parcels remain in your custody until the company confirms physical receipt.',
        ),
        findsOneWidget,
      );
      final pageScroll = find
          .descendant(
            of: find.byType(ListView),
            matching: find.byType(Scrollable),
          )
          .first;
      await tester.scrollUntilVisible(
        find.text('Request pickup'),
        250,
        scrollable: pageScroll,
      );
      await tester.tap(find.text('Request pickup'));
      await tester.pumpAndSettle();
      expect(find.text('Select between 1 and 200 parcels.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('Arabic pickup permissions render in RTL', (tester) async {
    await tester.pumpWidget(
      localized(const PickupsPage(), owner: false, language: 'ar'),
    );
    await tester.pumpAndSettle();
    final text = find.text('ليس لديك صلاحية إدارة طلبات الاستلام.');
    expect(text, findsOneWidget);
    expect(Directionality.of(tester.element(text)), TextDirection.rtl);
  });
}
