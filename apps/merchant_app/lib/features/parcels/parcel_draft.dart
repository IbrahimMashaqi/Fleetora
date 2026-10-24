import '../../core/location/geo_pin.dart';
import '../../core/networking/merchant_api.dart';
import '../../core/networking/models.dart';

bool validAmount(String value, String mode, {String? currency}) {
  if (!RegExp(r'^\d{1,14}(?:\.\d{1,3})?$').hasMatch(value)) return false;
  if (currency != null) {
    final precision = currency == 'JOD' ? 3 : 2;
    final fraction = value.split('.');
    if (!const ['ILS', 'USD', 'EUR', 'JOD'].contains(currency) ||
        (fraction.length > 1 && fraction[1].length > precision)) {
      return false;
    }
  }
  final zero = RegExp(r'^0+(?:\.0+)?$').hasMatch(value);
  return mode == 'PREPAID' ? zero : mode == 'COD' && !zero;
}

String canonicalAmount(String value) {
  final parts = value.split('.');
  final whole = parts.first.replaceFirst(RegExp(r'^0+(?=\d)'), '');
  final decimal = parts.length > 1
      ? parts[1].replaceFirst(RegExp(r'0+$'), '')
      : '';
  return decimal.isEmpty ? whole : '$whole.$decimal';
}

bool priceMatches(PricingPreview preview, String zone, String amount) =>
    preview.deliveryZoneId == zone &&
    canonicalAmount(preview.finalCustomerAmount) == canonicalAmount(amount);

class ParcelDraft {
  const ParcelDraft({
    required this.recipientName,
    required this.recipientPhone,
    this.secondaryPhone = '',
    required this.destination,
    required this.zone,
    required this.amount,
    required this.mode,
    required this.description,
    required this.pieces,
    this.reference = '',
    this.notes = '',
    this.pin,
  });
  final String recipientName, recipientPhone, secondaryPhone, destination;
  final Zone zone;
  final String amount, mode, description, pieces, reference, notes;
  final GeoPin? pin;

  Map<String, String> get errors {
    final errors = <String, String>{};
    if (recipientName.trim().length < 2 || recipientName.trim().length > 150) {
      errors['recipientName'] = 'parcel_name_error';
    }
    final phonePattern = RegExp(r'^\+?[0-9 ()-]{6,30}$');
    if (!phonePattern.hasMatch(recipientPhone.trim())) {
      errors['recipientPhone'] = 'parcel_phone_error';
    }
    if (secondaryPhone.trim().isNotEmpty &&
        !phonePattern.hasMatch(secondaryPhone.trim())) {
      errors['secondaryPhone'] = 'parcel_phone_error';
    }
    if (destination.trim().length < 3 || destination.trim().length > 500) {
      errors['destination'] = 'parcel_address_error';
    }
    if (!validAmount(amount, mode, currency: zone.currency)) {
      errors['amount'] = 'parcel_amount_error';
    }
    if (description.trim().isEmpty || description.trim().length > 1000) {
      errors['description'] = 'parcel_description_error';
    }
    final count = int.tryParse(pieces);
    if (!RegExp(r'^\d+$').hasMatch(pieces) ||
        count == null ||
        count < 1 ||
        count > 1000) {
      errors['pieces'] = 'parcel_pieces_error';
    }
    if (reference.trim().length > 100) {
      errors['reference'] = 'parcel_reference_error';
    }
    if (notes.trim().length > 1000) errors['notes'] = 'parcel_notes_error';
    return errors;
  }

  Json input(
    PricingPreview preview,
    String key, {
    int? revision,
    String? reason,
  }) {
    if (errors.isNotEmpty || !priceMatches(preview, zone.id, amount)) {
      throw StateError('Invalid or stale parcel draft');
    }
    return {
      'recipientName': recipientName.trim(),
      'recipientPhone': recipientPhone.trim(),
      if (secondaryPhone.trim().isNotEmpty)
        'secondaryPhone': secondaryPhone.trim(),
      'city': zone.city,
      'destination': destination.trim(),
      'zoneId': zone.id,
      'finalCustomerAmount': amount,
      'collectionMode': mode,
      'description': description.trim(),
      'pieces': int.parse(pieces),
      if (reference.trim().isNotEmpty) 'merchantReference': reference.trim(),
      if (notes.trim().isNotEmpty) 'notes': notes.trim(),
      if (pin != null) ...{
        'latitude': pin!.latitude,
        'longitude': pin!.longitude,
      },
      'pricingVersion': preview.pricingVersion,
      'idempotencyKey': key,
      'revision': ?revision,
      if (reason != null) 'reason': reason.trim(),
    };
  }
}
