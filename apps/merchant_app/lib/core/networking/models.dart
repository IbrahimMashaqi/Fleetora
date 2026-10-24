import 'package:json_annotation/json_annotation.dart';
part 'models.g.dart';

@JsonSerializable(checked: true, createToJson: false)
class Tokens {
  const Tokens({required this.accessToken, required this.refreshToken});
  final String accessToken;
  final String refreshToken;
  factory Tokens.fromJson(Map<String, dynamic> json) => _$TokensFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class Business {
  const Business({
    required this.id,
    required this.name,
    required this.pickupAddress,
    required this.city,
    required this.phone,
    this.latitude,
    this.longitude,
  });
  final String id;
  final String name;
  final String pickupAddress;
  final String city;
  final String phone;
  final double? latitude;
  final double? longitude;
  factory Business.fromJson(Map<String, dynamic> json) =>
      _$BusinessFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class Company {
  const Company({required this.id, required this.name});
  final String id;
  final String name;
  factory Company.fromJson(Map<String, dynamic> json) =>
      _$CompanyFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class MerchantContext {
  const MerchantContext({
    required this.userId,
    required this.merchantId,
    required this.companyId,
    required this.membershipId,
    required this.owner,
    required this.permissions,
    required this.merchant,
    required this.company,
  });
  final String userId;
  final String merchantId;
  final String companyId;
  final String membershipId;
  final bool owner;
  final List<String> permissions;
  final Business merchant;
  final Company company;
  factory MerchantContext.fromJson(Map<String, dynamic> json) =>
      _$MerchantContextFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class Zone {
  const Zone({
    required this.id,
    required this.name,
    required this.city,
    required this.currency,
  });
  final String id;
  final String name;
  final String city;
  final String currency;
  factory Zone.fromJson(Map<String, dynamic> json) => _$ZoneFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class PricingPreview {
  const PricingPreview({
    required this.finalCustomerAmount,
    required this.baseDeliveryFee,
    required this.discount,
    required this.promotionDiscount,
    this.promotionLabel,
    required this.deliveryFee,
    required this.expectedMerchantProceeds,
    required this.currency,
    required this.pricingVersion,
    required this.deliveryZoneId,
    required this.pricingPlanId,
    required this.zoneName,
    required this.city,
    required this.planName,
    required this.feePayer,
  });
  final String finalCustomerAmount;
  final String baseDeliveryFee;
  final String discount;
  final String promotionDiscount;
  final String? promotionLabel;
  final String deliveryFee;
  final String expectedMerchantProceeds;
  final String currency;
  final String pricingVersion;
  final String deliveryZoneId;
  final String pricingPlanId;
  final String zoneName;
  final String city;
  final String planName;
  final String feePayer;
  factory PricingPreview.fromJson(Map<String, dynamic> json) =>
      _$PricingPreviewFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class Parcel {
  const Parcel({
    required this.id,
    required this.trackingNumber,
    required this.recipientName,
    required this.recipientPhone,
    this.secondaryPhone,
    required this.city,
    required this.destination,
    this.deliveryZoneId,
    this.finalCustomerAmount,
    required this.currency,
    required this.custody,
    required this.collectionMode,
    required this.description,
    required this.pieces,
    this.merchantReference,
    this.customerNotes,
    required this.status,
    required this.revision,
    required this.createdAt,
    this.deliveryFee,
    this.latitude,
    this.longitude,
    this.locationLabel,
    this.locationSource,
    this.locationUpdatedAt,
    this.collectionRequired,
  });
  final String id;
  final String trackingNumber;
  final String recipientName;
  final String recipientPhone;
  final String? secondaryPhone;
  final String city;
  final String destination;
  final String? deliveryZoneId;
  final String? finalCustomerAmount;
  final String currency;
  final String custody;
  final String collectionMode;
  final String description;
  final int pieces;
  final String? merchantReference;
  final String? customerNotes;
  final String status;
  final int revision;
  final String createdAt;
  final String? deliveryFee;
  final double? latitude;
  final double? longitude;
  final String? locationLabel;
  final String? locationSource;
  final String? locationUpdatedAt;
  final bool? collectionRequired;
  factory Parcel.fromJson(Map<String, dynamic> json) => _$ParcelFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class ParcelEvent {
  const ParcelEvent({
    required this.id,
    required this.event,
    this.fromStatus,
    this.toStatus,
    this.custody,
    this.locationLabel,
    required this.occurredAt,
  });
  final String id;
  final String event;
  final String? fromStatus;
  final String? toStatus;
  final String? custody;
  final String? locationLabel;
  final String occurredAt;
  factory ParcelEvent.fromJson(Map<String, dynamic> json) =>
      _$ParcelEventFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class ParcelActions {
  const ParcelActions({
    required this.edit,
    required this.cancel,
    required this.requestAmendment,
    required this.requestCancellation,
  });
  final bool edit;
  final bool cancel;
  final bool requestAmendment;
  final bool requestCancellation;
  factory ParcelActions.fromJson(Map<String, dynamic> json) =>
      _$ParcelActionsFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class ParcelDetails {
  const ParcelDetails({
    required this.parcel,
    required this.events,
    required this.historyAvailable,
    this.actions,
  });
  final Parcel parcel;
  final List<ParcelEvent> events;
  final bool historyAvailable;
  final ParcelActions? actions;
  factory ParcelDetails.fromJson(Map<String, dynamic> json) =>
      _$ParcelDetailsFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class ParcelRequest {
  const ParcelRequest({
    required this.id,
    required this.status,
    required this.kind,
    required this.reason,
    this.reviewReason,
  });
  final String id;
  final String status;
  final String kind;
  final String reason;
  final String? reviewReason;
  factory ParcelRequest.fromJson(Map<String, dynamic> json) =>
      _$ParcelRequestFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class PickupParcel {
  const PickupParcel({
    required this.id,
    required this.shipmentId,
    required this.receipt,
  });
  final String id;
  final String shipmentId;
  final String receipt;
  factory PickupParcel.fromJson(Map<String, dynamic> json) =>
      _$PickupParcelFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class Pickup {
  const Pickup({
    required this.id,
    required this.method,
    required this.status,
    required this.revision,
    this.preferredFrom,
    this.preferredTo,
    this.proposedFrom,
    this.proposedTo,
    this.confirmedFrom,
    this.confirmedTo,
    required this.pickupAddress,
    this.notes,
    this.latitude,
    this.longitude,
    this.parcels,
  });
  final String id;
  final String method;
  final String status;
  final int revision;
  final String? preferredFrom;
  final String? preferredTo;
  final String? proposedFrom;
  final String? proposedTo;
  final String? confirmedFrom;
  final String? confirmedTo;
  final String pickupAddress;
  final String? notes;
  final double? latitude;
  final double? longitude;
  final List<PickupParcel>? parcels;
  factory Pickup.fromJson(Map<String, dynamic> json) => _$PickupFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class Employee {
  const Employee({
    required this.id,
    required this.userId,
    required this.role,
    required this.status,
    required this.permissions,
    required this.fullName,
    this.email,
  });
  final String id;
  final String userId;
  final String role;
  final String status;
  final List<String> permissions;
  final String fullName;
  final String? email;
  factory Employee.fromJson(Map<String, dynamic> json) =>
      _$EmployeeFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class EmployeeUpdate {
  const EmployeeUpdate({
    required this.id,
    required this.status,
    required this.permissions,
  });
  final String id;
  final String status;
  final List<String> permissions;
  factory EmployeeUpdate.fromJson(Map<String, dynamic> json) =>
      _$EmployeeUpdateFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class Invitation {
  const Invitation({
    required this.id,
    required this.email,
    required this.role,
    required this.permissions,
    required this.expiresAt,
    this.acceptedAt,
    this.revokedAt,
    this.token,
  });
  final String id;
  final String email;
  final String role;
  final List<String> permissions;
  final String expiresAt;
  final String? acceptedAt;
  final String? revokedAt;
  final String? token;
  factory Invitation.fromJson(Map<String, dynamic> json) =>
      _$InvitationFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class Activity {
  const Activity({
    required this.id,
    required this.actorId,
    required this.action,
    required this.createdAt,
  });
  final String id;
  final String actorId;
  final String action;
  final String createdAt;
  factory Activity.fromJson(Map<String, dynamic> json) =>
      _$ActivityFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class ImportRow {
  const ImportRow({
    required this.rowNumber,
    required this.errors,
    this.preview,
  });
  final int rowNumber;
  final List<String> errors;
  final PricingPreview? preview;
  factory ImportRow.fromJson(Map<String, dynamic> json) =>
      _$ImportRowFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class ImportPreview {
  const ImportPreview({
    required this.importId,
    required this.rows,
    required this.validCount,
    required this.invalidCount,
  });
  final String importId;
  final List<ImportRow> rows;
  final int validCount;
  final int invalidCount;
  factory ImportPreview.fromJson(Map<String, dynamic> json) =>
      _$ImportPreviewFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class ImportResult {
  const ImportResult({
    required this.created,
    required this.rejected,
    required this.duplicates,
    required this.parcels,
  });
  final int created;
  final int rejected;
  final int duplicates;
  final List<String> parcels;
  factory ImportResult.fromJson(Map<String, dynamic> json) =>
      _$ImportResultFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class StatementEntry {
  const StatementEntry({
    required this.id,
    required this.kind,
    required this.amount,
    required this.currency,
    this.reason,
    required this.createdAt,
    this.shipmentId,
  });
  final String id;
  final String kind;
  final String amount;
  final String currency;
  final String? reason;
  final String createdAt;
  final String? shipmentId;
  factory StatementEntry.fromJson(Map<String, dynamic> json) =>
      _$StatementEntryFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class Balance {
  const Balance({
    required this.currency,
    required this.balance,
    required this.eligible,
    required this.paid,
  });
  final String currency;
  final String balance;
  final String eligible;
  final String paid;
  factory Balance.fromJson(Map<String, dynamic> json) =>
      _$BalanceFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class Statement {
  const Statement({
    required this.items,
    required this.balances,
    required this.page,
    required this.pageSize,
    required this.hasNext,
  });
  final List<StatementEntry> items;
  final List<Balance> balances;
  final int page;
  final int pageSize;
  final bool hasNext;
  factory Statement.fromJson(Map<String, dynamic> json) =>
      _$StatementFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class SettlementRequest {
  const SettlementRequest({
    required this.id,
    required this.currency,
    this.notes,
    required this.status,
    required this.createdAt,
  });
  final String id;
  final String currency;
  final String? notes;
  final String status;
  final String createdAt;
  factory SettlementRequest.fromJson(Map<String, dynamic> json) =>
      _$SettlementRequestFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class ParcelLabel {
  const ParcelLabel({required this.trackingNumber, required this.qrSvg});
  final String trackingNumber;
  final String qrSvg;
  factory ParcelLabel.fromJson(Map<String, dynamic> json) =>
      _$ParcelLabelFromJson(json);
}

@JsonSerializable(checked: true, createToJson: false)
class ImportTemplate {
  const ImportTemplate({required this.filename, required this.fileBase64});
  final String filename;
  final String fileBase64;
  factory ImportTemplate.fromJson(Map<String, dynamic> json) =>
      _$ImportTemplateFromJson(json);
}

class PageResult<T> {
  const PageResult({
    required this.items,
    required this.page,
    required this.pageSize,
    required this.hasNext,
  });
  final List<T> items;
  final int page;
  final int pageSize;
  final bool hasNext;
}
