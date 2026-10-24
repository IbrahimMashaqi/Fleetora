import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:fleetora_merchant/features/pickups/pickup_repository.dart';
import 'package:flutter_test/flutter_test.dart';

Pickup pickup(String status, List<String>? receipts) => Pickup(
  id: 'pickup',
  method: 'COMPANY_PICKUP',
  status: status,
  revision: 1,
  pickupAddress: 'Address',
  parcels: receipts?.indexed
      .map(
        (entry) => PickupParcel(
          id: '${entry.$1}',
          shipmentId: '${entry.$1}',
          receipt: entry.$2,
        ),
      )
      .toList(),
);

Parcel parcel(String status, String custody) => Parcel(
  id: 'parcel',
  trackingNumber: 'TRACK-1',
  recipientName: 'Recipient',
  recipientPhone: '0599000000',
  city: 'Ramallah',
  destination: 'Main street',
  currency: 'ILS',
  custody: custody,
  collectionMode: 'PREPAID',
  description: 'Books',
  pieces: 1,
  status: status,
  revision: 1,
  createdAt: '2026-10-22T12:00:00Z',
);

void main() {
  test('only created parcels still in merchant custody can be selected', () {
    expect(isReadyForPickup(parcel('CREATED', 'MERCHANT')), isTrue);
    expect(isReadyForPickup(parcel('CREATED', 'COMPANY')), isFalse);
    expect(
      isReadyForPickup(parcel('RECEIVED_FROM_MERCHANT', 'MERCHANT')),
      isFalse,
    );
    expect(isReadyForPickup(parcel('CANCELLED', 'MERCHANT')), isFalse);
  });
  test('preferred window requires complete, future, ordered times', () {
    final now = DateTime.utc(2026, 10, 22, 12);
    final later = now.add(const Duration(hours: 1));
    expect(validPreferredWindow(null, null, now), isFalse);
    expect(validPreferredWindow(null, later, now), isFalse);
    expect(validPreferredWindow(now, later, now), isFalse);
    expect(validPreferredWindow(later, now, now), isFalse);
    expect(validPreferredWindow(later, later, now), isFalse);
    expect(
      validPreferredWindow(later, later.add(const Duration(hours: 1)), now),
      isTrue,
    );
  });
  test(
    'cancellation is unavailable after receipt or closure or unknown receipts',
    () {
      expect(
        canCancelPickup(pickup('REQUESTED', ['PENDING', 'PENDING'])),
        isTrue,
      );
      expect(canCancelPickup(pickup('PROPOSED', ['PENDING'])), isTrue);
      for (final status in ['CANCELLED', 'RECEIVED']) {
        expect(canCancelPickup(pickup(status, ['PENDING'])), isFalse);
      }
      for (final receipt in ['RECEIVED', 'DISCREPANT', 'MISSING']) {
        expect(
          canCancelPickup(pickup('CONFIRMED', ['PENDING', receipt])),
          isFalse,
        );
      }
      expect(canCancelPickup(pickup('REQUESTED', null)), isFalse);
    },
  );
}
