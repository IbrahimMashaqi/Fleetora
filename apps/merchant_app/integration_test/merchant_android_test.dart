import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:maplibre/maplibre.dart';
import 'package:printing/printing.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'package:fleetora_merchant/app/app.dart';
import 'package:fleetora_merchant/app/localization/copy.dart';
import 'package:fleetora_merchant/core/authentication/token_store.dart';
import 'package:fleetora_merchant/core/config/app_config.dart';
import 'package:fleetora_merchant/core/location/geo_pin.dart';
import 'package:fleetora_merchant/core/location/pin_picker.dart';
import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:fleetora_merchant/features/pricing/pricing_summary.dart';
import 'package:fleetora_merchant/features/bulk_import/import_page.dart';

// This runs against the guarded, disposable Nest/PostgreSQL fixture. No HTTP,
// secure-storage, printing, map, or authentication providers are overridden.
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  // Native map textures must keep receiving frames during real-time captures.
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  // The test binding otherwise discards adb/physical touches and prints finders.
  binding.shouldPropagateDevicePointerEvents = true;
  testWidgets('actual Android merchant workflows against owned PostgreSQL', (
    tester,
  ) async {
    const email = String.fromEnvironment('NATIVE_TEST_EMAIL');
    const password = String.fromEnvironment('NATIVE_TEST_PASSWORD');
    const zone = String.fromEnvironment('NATIVE_TEST_ZONE');
    const expiredAccess = String.fromEnvironment('NATIVE_TEST_EXPIRED_ACCESS');
    const expiredRefresh = String.fromEnvironment(
      'NATIVE_TEST_EXPIRED_REFRESH',
    );
    if (email.isEmpty || password.isEmpty || zone.isEmpty) {
      fail('Use the isolated backend native test harness');
    }
    final store = DeviceTokenStore(AppConfig.configuredUrl);
    await store.clear();
    void checked(String name) => debugPrint('NATIVE_CHECK $name=PASS');
    Future<void> dismissKeyboard() async {
      FocusManager.instance.primaryFocus?.unfocus();
      await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
      await tester.pump(const Duration(milliseconds: 250));
    }

    Future<void> capture(String name) async {
      debugPrint('NATIVE_WAIT $name');
      // The host captures the real map or waits for, captures and cancels an OS
      // sheet. Keep this screen mounted until that asynchronous check finishes.
      await tester.runAsync<void>(
        () => Future<void>.delayed(
          Duration(
            seconds: name == 'MAP_REVIEW'
                ? 15
                : name == 'PRINT_SHEET' || name == 'SHARE_SHEET'
                ? 45
                : 8,
          ),
        ),
      );
    }

    Future<void> waitFor(Finder finder) async {
      for (var i = 0; i < 180 && finder.evaluate().isEmpty; i++) {
        await tester.pump(const Duration(milliseconds: 250));
      }
      expect(finder, findsWidgets);
    }

    Future<void> reveal(Finder finder) async {
      await tester.scrollUntilVisible(
        finder,
        240,
        scrollable: find.byType(Scrollable).last,
        maxScrolls: 60,
      );
      await tester.ensureVisible(finder);
      await tester.pump(const Duration(milliseconds: 200));
    }

    Future<void> tapText(String text) async {
      final candidates = find.text(text);
      if (candidates.evaluate().isEmpty) await reveal(candidates);
      expect(candidates, findsWidgets);
      final target = candidates.last;
      await tester.ensureVisible(target);
      await tester.tap(target);
      await tester.pump(const Duration(milliseconds: 500));
    }

    Future<void> enter(String key, String value) async {
      final field = find.byKey(ValueKey(key));
      await reveal(field);
      await tester.enterText(field, value);
      await dismissKeyboard();
      await tester.pump(const Duration(milliseconds: 150));
    }

    Future<void> mount() async {
      await tester.pumpWidget(
        const ProviderScope(child: FleetoraMerchantApp()),
      );
      await tester.pump(const Duration(milliseconds: 500));
    }

    await mount();
    await waitFor(find.text('English'));
    expect(
      Directionality.of(tester.element(find.byType(Form))),
      TextDirection.rtl,
    );
    checked('arabic_rtl');
    await tapText('English');
    expect(
      Directionality.of(tester.element(find.byType(Form))),
      TextDirection.ltr,
    );
    checked('english_ltr');
    await tester.enterText(find.byType(TextFormField).at(0), email);
    await tester.enterText(find.byType(TextFormField).at(1), password);
    await dismissKeyboard();
    await tapText('Sign in');
    await waitFor(find.text('Fictional merchant'));
    checked('login');
    await capture('EN_MAIN');
    expect(await store.read() != null, isTrue);
    checked('secure_storage');

    // Dispose the full app/container; the next app reads Android encrypted
    // storage and validates the restored identity through the actual backend.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 200));
    await mount();
    await waitFor(find.text('Fictional merchant'));
    checked('session_restore');
    await capture('AR_MAIN');
    final beforeRefresh = await store.read();
    if (beforeRefresh == null) fail('Android credential persistence failed');
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 200));
    await store.write(
      Tokens(
        accessToken: expiredAccess,
        refreshToken: beforeRefresh.refreshToken,
      ),
    );
    await mount();
    await waitFor(find.text('Fictional merchant'));
    final afterRefresh = await store.read();
    expect(
      afterRefresh != null && afterRefresh.accessToken != expiredAccess,
      isTrue,
    );
    checked('expired_access_refresh');
    await tester.tap(find.byIcon(Icons.translate));
    await tester.pump(const Duration(milliseconds: 300));

    Future<void> createParcel(bool prepaid) async {
      await tapText('Create parcel');
      await waitFor(find.byKey(const ValueKey('recipientName')));
      await enter(
        'recipientName',
        prepaid ? 'Android prepaid recipient' : 'Android verified recipient',
      );
      await enter('recipientPhone', '+000000004');
      await reveal(find.byKey(const ValueKey('zoneDropdown')));
      await tester.tap(find.byKey(const ValueKey('zoneDropdown')));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.text(zone).last);
      await tester.pump(const Duration(milliseconds: 300));
      await enter('destination', 'Android isolated recipient address');
      if (!prepaid) {
        await tapText('Choose an optional location pin');
        await waitFor(find.byType(AlertDialog));
        await waitFor(find.byType(MapLibreMap));
        // Actual platform map is created. A selected test destination is not GPS.
        final center = tester.getCenter(find.byType(MapLibreMap));
        final ratio = binding.platformDispatcher.views.first.devicePixelRatio;
        // The host sends an actual Android touch to the native platform view.
        debugPrint(
          'NATIVE_MAP_TAP x=${(center.dx * ratio).round()} y=${(center.dy * ratio).round()}',
        );
        await capture('MAP_REVIEW');
        final pinFields = find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(TextField),
        );
        expect(
          tester.widget<TextField>(pinFields.at(0)).controller!.text,
          isNotEmpty,
        );
        expect(
          tester.widget<TextField>(pinFields.at(1)).controller!.text,
          isNotEmpty,
        );
        checked('map_native_tap');
        await tapText('Confirm selected location');
        final selected = tester.widget<PinField>(find.byType(PinField)).value;
        expect(selected, isNotNull);
        final pin = selected!;
        expect(GeoPin(pin.latitude, pin.longitude).latitude, pin.latitude);
        final coordinates =
            '${pin.latitude.toStringAsFixed(6)}, ${pin.longitude.toStringAsFixed(6)}';
        expect(find.text(coordinates), findsOneWidget);

        // Recreate the actual native map in RTL, then cancel a different touch.
        // The confirmed form value must survive disposal and locale rebuilds.
        await tester.tap(find.byIcon(Icons.translate));
        await tester.pump(const Duration(milliseconds: 300));
        String localized(String key) =>
            tester.element(find.byType(PinField)).tr(key);
        await tapText(localized('parcel_choose_pin'));
        await waitFor(find.byType(MapLibreMap));
        expect(
          Directionality.of(tester.element(find.byType(AlertDialog))),
          TextDirection.rtl,
        );
        final reopened = tester.widget<MapLibreMap>(find.byType(MapLibreMap));
        expect(reopened.options.initCenter?.lat, pin.latitude);
        expect(reopened.options.initCenter?.lon, pin.longitude);
        final otherPoint =
            tester.getCenter(find.byType(MapLibreMap)) + const Offset(24, 24);
        debugPrint(
          'NATIVE_MAP_TAP x=${(otherPoint.dx * ratio).round()} y=${(otherPoint.dy * ratio).round()}',
        );
        await capture('MAP_REVIEW');
        final otherFields = find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(TextField),
        );
        final otherLatitude = double.parse(
          tester.widget<TextField>(otherFields.at(0)).controller!.text,
        );
        final otherLongitude = double.parse(
          tester.widget<TextField>(otherFields.at(1)).controller!.text,
        );
        expect(GeoPin(otherLatitude, otherLongitude).longitude, otherLongitude);
        expect(otherLatitude, isNot(closeTo(pin.latitude, 0.000001)));
        checked('map_arabic_rtl');
        await tapText(localized('back'));
        expect(tester.widget<PinField>(find.byType(PinField)).value, same(pin));
        checked('map_cancel_preserves_pin');

        await tester.tap(find.byIcon(Icons.translate));
        await tester.pump(const Duration(milliseconds: 300));
        await tapText('Choose an optional location pin');
        await waitFor(find.byType(MapLibreMap));
        final retainedFields = find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byType(TextField),
        );
        expect(
          double.parse(
            tester.widget<TextField>(retainedFields.at(0)).controller!.text,
          ),
          pin.latitude,
        );
        expect(
          double.parse(
            tester.widget<TextField>(retainedFields.at(1)).controller!.text,
          ),
          pin.longitude,
        );
        await tapText('Confirm selected location');
        expect(find.byType(MapLibreMap), findsNothing);
        expect(tester.takeException(), isNull);
        checked('map_reopen');
        debugPrint(
          'NATIVE_MAP_SELECTED latitude=${pin.latitude} longitude=${pin.longitude}',
        );
        checked('map_pin');
      }
      await reveal(find.byKey(const ValueKey('modeDropdown')));
      if (prepaid) {
        await tester.tap(find.byKey(const ValueKey('modeDropdown')));
        await tester.pump(const Duration(milliseconds: 250));
        await tester.tap(find.text('Prepaid / no collection').last);
        await tester.pump(const Duration(milliseconds: 250));
      } else {
        await enter('amount', '150');
      }
      await tapText('Preview contractual price');
      await waitFor(find.byType(PricingSummary));
      final preview = tester
          .widget<PricingSummary>(find.byType(PricingSummary))
          .preview;
      expect(preview.finalCustomerAmount, prepaid ? '0.00' : '150.00');
      expect(preview.deliveryFee, '15.00');
      expect(preview.expectedMerchantProceeds, prepaid ? '-15.00' : '135.00');
      if (!prepaid) checked('inclusive_pricing');
      await enter('description', 'Android fixture goods');
      await tapText('Create parcel');
      await waitFor(
        find.text(
          prepaid ? 'Android prepaid recipient' : 'Android verified recipient',
        ),
      );
      checked(prepaid ? 'zero_cod' : 'cod_parcel');
    }

    await createParcel(false);
    await tapText('Parcel label and QR code');
    await waitFor(find.byType(QrImageView));
    expect(
      find.descendant(
        of: find.byType(QrImageView),
        matching: find.byWidgetPredicate(
          (widget) => widget is CustomPaint && widget.painter is QrPainter,
        ),
      ),
      findsOneWidget,
    );
    checked('qr_label');
    await tapText('Preview PDF');
    await waitFor(find.byType(PdfPreview));
    await waitFor(
      find.descendant(
        of: find.byType(PdfPreview),
        matching: find.byType(Image),
      ),
    );
    checked('pdf_raster');
    await tester.tap(find.byIcon(Icons.close));
    await tester.pump(const Duration(milliseconds: 300));
    final printingInfo = await Printing.info();
    debugPrint(
      'NATIVE_CAPABILITY canPrint=${printingInfo.canPrint} canShare=${printingInfo.canShare}',
    );
    if (const bool.fromEnvironment('NATIVE_TEST_SYSTEM_SHEETS')) {
      for (final action in [
        (
          enabled: printingInfo.canPrint,
          label: 'Print labels',
          phase: 'PRINT_SHEET',
          check: 'print_sheet_cancelled',
        ),
        (
          enabled: printingInfo.canShare,
          label: 'Share PDF',
          phase: 'SHARE_SHEET',
          check: 'share_sheet_cancelled',
        ),
      ]) {
        if (!action.enabled) continue;
        await tester.tap(find.text(action.label));
        await tester.runAsync<void>(
          () => Future<void>.delayed(const Duration(seconds: 2)),
        );
        await capture(action.phase);
        await tester.pump(const Duration(milliseconds: 500));
        for (
          var i = 0;
          i < 80 && find.byType(LinearProgressIndicator).evaluate().isNotEmpty;
          i++
        ) {
          await tester.pump(const Duration(milliseconds: 250));
        }
        expect(find.byType(LinearProgressIndicator), findsNothing);
        expect(
          find.text(
            'Could not generate or open the document. Try again or use another available print/share option.',
          ),
          findsNothing,
        );
        checked(action.check);
      }
    }

    Future<void> home() async {
      await tester.tap(find.byIcon(Icons.space_dashboard_outlined).last);
      await tester.pump(const Duration(milliseconds: 500));
      await waitFor(find.text('Create parcel'));
    }

    await home();
    await createParcel(true);
    await tester.tap(find.byIcon(Icons.inventory_2_outlined).last);
    await tester.pump(const Duration(milliseconds: 500));
    await waitFor(find.text('Android verified recipient'));
    await waitFor(find.text('Android prepaid recipient'));
    checked('parcel_list');
    await home();
    await tapText('Request pickup');
    await waitFor(find.byType(DropdownButtonFormField<String>));
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pump(const Duration(milliseconds: 250));
    await tester.tap(find.text('Warehouse drop-off').last);
    await tester.pump(const Duration(milliseconds: 300));
    for (var i = 0; i < 2; i++) {
      final checkbox = find.byType(CheckboxListTile).at(i);
      await reveal(checkbox);
      await tester.tap(checkbox);
      await tester.pump(const Duration(milliseconds: 200));
    }
    await tapText('Request pickup');
    await waitFor(find.text('Pickup details'));
    checked('warehouse_pickup');
    if (const bool.fromEnvironment('NATIVE_TEST_PICKER')) {
      await home();
      await tapText('Bulk import');
      await tapText('Select XLSX file');
      // Root chooses the real owned XLSX in Android DocumentsUI. No platform
      // channel substitution: file_picker must return actual selected bytes.
      debugPrint('NATIVE_WAIT FILE_PICKER');
      for (
        var i = 0;
        i < 480 && find.text('fleetora-native.xlsx').evaluate().isEmpty;
        i++
      ) {
        await tester.pump(const Duration(milliseconds: 250));
      }
      await waitFor(find.byType(ImportPreviewRow));
      final importedPreview = tester
          .widget<ImportPreviewRow>(find.byType(ImportPreviewRow))
          .row
          .preview;
      expect(importedPreview?.finalCustomerAmount, '150.00');
      expect(importedPreview?.deliveryFee, '15.00');
      await tapText('Confirm import');
      await tapText('Confirm');
      await waitFor(find.text('Created: 1'));
      checked('excel_picker_upload');
    }
    await tester.tap(find.byIcon(Icons.logout));
    await tester.pump(const Duration(milliseconds: 250));
    await tapText('Confirm');
    await waitFor(find.text('Sign in'));
    checked('logout');
    expect(await store.read() == null, isTrue);
    checked('logout_storage');
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 200));
    await store.write(
      const Tokens(accessToken: expiredAccess, refreshToken: expiredRefresh),
    );
    await mount();
    await waitFor(find.text('English'));
    expect(await store.read() == null, isTrue);
    checked('expired_refresh_signout');
  }, timeout: const Timeout(Duration(minutes: 12)));
}
