import 'package:flutter_test/flutter_test.dart';
import 'package:fleetora_merchant/core/location/geo_pin.dart';
import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:fleetora_merchant/features/parcels/parcel_draft.dart';

const zone = Zone(
  id: 'zone',
  name: 'Ramallah',
  city: 'Ramallah',
  currency: 'ILS',
);
const quote = PricingPreview(
  finalCustomerAmount: '150.000',
  baseDeliveryFee: '15.000',
  discount: '0.000',
  promotionDiscount: '0.000',
  deliveryFee: '15.000',
  expectedMerchantProceeds: '135.000',
  currency: 'ILS',
  pricingVersion: 'version',
  deliveryZoneId: 'zone',
  pricingPlanId: 'plan',
  zoneName: 'Ramallah',
  city: 'Ramallah',
  planName: 'Contract',
  feePayer: 'MERCHANT',
);
ParcelDraft draft({
  String phone = '+970599123456',
  String amount = '150',
  String mode = 'COD',
  String pieces = '1',
  GeoPin? pin,
}) => ParcelDraft(
  recipientName: 'Recipient',
  recipientPhone: phone,
  destination: 'Main street',
  zone: zone,
  amount: amount,
  mode: mode,
  description: 'Books',
  pieces: pieces,
  pin: pin,
);

void main() {
  test('COD is positive; prepaid is zero; decimal strings stay exact', () {
    expect(validAmount('0', 'COD'), isFalse);
    expect(validAmount('0.000', 'PREPAID'), isTrue);
    expect(validAmount('150', 'PREPAID'), isFalse);
    expect(validAmount('150.123', 'COD'), isTrue);
    expect(validAmount('150.123', 'COD', currency: 'ILS'), isFalse);
    expect(validAmount('150.25', 'COD', currency: 'ILS'), isTrue);
    for (final value in ['1.005', '', 'NaN', '1,000', '1.']) {
      expect(validAmount(value, 'COD', currency: 'ILS'), isFalse);
    }
    expect(validAmount('150.123', 'COD', currency: 'JOD'), isTrue);
    expect(validAmount('1e3', 'COD'), isFalse);
    expect(validAmount('1.1234', 'COD'), isFalse);
    expect(validAmount('-1', 'COD'), isFalse);
  });
  test(
    'price guard accepts equivalent decimals and rejects changed amount/zone',
    () {
      expect(priceMatches(quote, 'zone', '150'), isTrue);
      expect(priceMatches(quote, 'zone', '150.001'), isFalse);
      expect(priceMatches(quote, 'other', '150'), isFalse);
    },
  );
  test(
    'draft sends contractual version and stable write key with exact amount',
    () {
      final input = draft().input(quote, 'stable-key');
      expect(input['pricingVersion'], 'version');
      expect(input['idempotencyKey'], 'stable-key');
      expect(input['finalCustomerAmount'], '150');
      expect(input.containsKey('deliveryFee'), isFalse);
      expect(input.containsKey('companyId'), isFalse);
      expect(() => draft(amount: '151').input(quote, 'key'), throwsStateError);
    },
  );
  test(
    'validates contact and piece limits without weakening server validation',
    () {
      expect(draft(phone: 'invalid').errors['recipientPhone'], isNotNull);
      expect(draft(pieces: '0').errors['pieces'], isNotNull);
      expect(draft(pieces: '1001').errors['pieces'], isNotNull);
      expect(draft().errors, isEmpty);
    },
  );
  test('explicit pins reject invalid and nonfinite coordinates', () {
    expect(() => GeoPin(91, 35), throwsFormatException);
    expect(() => GeoPin(32, double.nan), throwsFormatException);
    expect(GeoPin(31.9, 35.2).latitude, 31.9);
  });
  test('selected coordinates reach the parcel request without swapping or rounding', () {
    final pin = GeoPin(31.917253184, 35.203481726);
    final input = draft(pin: pin).input(quote, 'location-key');
    expect(input['latitude'], pin.latitude);
    expect(input['longitude'], pin.longitude);
    expect(
      draft().input(quote, 'no-location-key'),
      isNot(contains('latitude')),
    );
    expect(
      draft().input(quote, 'no-location-key'),
      isNot(contains('longitude')),
    );
  });
}
