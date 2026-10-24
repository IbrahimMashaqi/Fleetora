// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'models.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Tokens _$TokensFromJson(Map<String, dynamic> json) =>
    $checkedCreate('Tokens', json, ($checkedConvert) {
      final val = Tokens(
        accessToken: $checkedConvert('accessToken', (v) => v as String),
        refreshToken: $checkedConvert('refreshToken', (v) => v as String),
      );
      return val;
    });

Business _$BusinessFromJson(Map<String, dynamic> json) =>
    $checkedCreate('Business', json, ($checkedConvert) {
      final val = Business(
        id: $checkedConvert('id', (v) => v as String),
        name: $checkedConvert('name', (v) => v as String),
        pickupAddress: $checkedConvert('pickupAddress', (v) => v as String),
        city: $checkedConvert('city', (v) => v as String),
        phone: $checkedConvert('phone', (v) => v as String),
        latitude: $checkedConvert('latitude', (v) => (v as num?)?.toDouble()),
        longitude: $checkedConvert('longitude', (v) => (v as num?)?.toDouble()),
      );
      return val;
    });

Company _$CompanyFromJson(Map<String, dynamic> json) =>
    $checkedCreate('Company', json, ($checkedConvert) {
      final val = Company(
        id: $checkedConvert('id', (v) => v as String),
        name: $checkedConvert('name', (v) => v as String),
      );
      return val;
    });

MerchantContext _$MerchantContextFromJson(Map<String, dynamic> json) =>
    $checkedCreate('MerchantContext', json, ($checkedConvert) {
      final val = MerchantContext(
        userId: $checkedConvert('userId', (v) => v as String),
        merchantId: $checkedConvert('merchantId', (v) => v as String),
        companyId: $checkedConvert('companyId', (v) => v as String),
        membershipId: $checkedConvert('membershipId', (v) => v as String),
        owner: $checkedConvert('owner', (v) => v as bool),
        permissions: $checkedConvert(
          'permissions',
          (v) => (v as List<dynamic>).map((e) => e as String).toList(),
        ),
        merchant: $checkedConvert(
          'merchant',
          (v) => Business.fromJson(v as Map<String, dynamic>),
        ),
        company: $checkedConvert(
          'company',
          (v) => Company.fromJson(v as Map<String, dynamic>),
        ),
      );
      return val;
    });

Zone _$ZoneFromJson(Map<String, dynamic> json) =>
    $checkedCreate('Zone', json, ($checkedConvert) {
      final val = Zone(
        id: $checkedConvert('id', (v) => v as String),
        name: $checkedConvert('name', (v) => v as String),
        city: $checkedConvert('city', (v) => v as String),
        currency: $checkedConvert('currency', (v) => v as String),
      );
      return val;
    });

PricingPreview _$PricingPreviewFromJson(Map<String, dynamic> json) =>
    $checkedCreate('PricingPreview', json, ($checkedConvert) {
      final val = PricingPreview(
        finalCustomerAmount: $checkedConvert(
          'finalCustomerAmount',
          (v) => v as String,
        ),
        baseDeliveryFee: $checkedConvert('baseDeliveryFee', (v) => v as String),
        discount: $checkedConvert('discount', (v) => v as String),
        promotionDiscount: $checkedConvert(
          'promotionDiscount',
          (v) => v as String,
        ),
        promotionLabel: $checkedConvert('promotionLabel', (v) => v as String?),
        deliveryFee: $checkedConvert('deliveryFee', (v) => v as String),
        expectedMerchantProceeds: $checkedConvert(
          'expectedMerchantProceeds',
          (v) => v as String,
        ),
        currency: $checkedConvert('currency', (v) => v as String),
        pricingVersion: $checkedConvert('pricingVersion', (v) => v as String),
        deliveryZoneId: $checkedConvert('deliveryZoneId', (v) => v as String),
        pricingPlanId: $checkedConvert('pricingPlanId', (v) => v as String),
        zoneName: $checkedConvert('zoneName', (v) => v as String),
        city: $checkedConvert('city', (v) => v as String),
        planName: $checkedConvert('planName', (v) => v as String),
        feePayer: $checkedConvert('feePayer', (v) => v as String),
      );
      return val;
    });

Parcel _$ParcelFromJson(Map<String, dynamic> json) =>
    $checkedCreate('Parcel', json, ($checkedConvert) {
      final val = Parcel(
        id: $checkedConvert('id', (v) => v as String),
        trackingNumber: $checkedConvert('trackingNumber', (v) => v as String),
        recipientName: $checkedConvert('recipientName', (v) => v as String),
        recipientPhone: $checkedConvert('recipientPhone', (v) => v as String),
        secondaryPhone: $checkedConvert('secondaryPhone', (v) => v as String?),
        city: $checkedConvert('city', (v) => v as String),
        destination: $checkedConvert('destination', (v) => v as String),
        deliveryZoneId: $checkedConvert('deliveryZoneId', (v) => v as String?),
        finalCustomerAmount: $checkedConvert(
          'finalCustomerAmount',
          (v) => v as String?,
        ),
        currency: $checkedConvert('currency', (v) => v as String),
        custody: $checkedConvert('custody', (v) => v as String),
        collectionMode: $checkedConvert('collectionMode', (v) => v as String),
        description: $checkedConvert('description', (v) => v as String),
        pieces: $checkedConvert('pieces', (v) => (v as num).toInt()),
        merchantReference: $checkedConvert(
          'merchantReference',
          (v) => v as String?,
        ),
        customerNotes: $checkedConvert('customerNotes', (v) => v as String?),
        status: $checkedConvert('status', (v) => v as String),
        revision: $checkedConvert('revision', (v) => (v as num).toInt()),
        createdAt: $checkedConvert('createdAt', (v) => v as String),
        deliveryFee: $checkedConvert('deliveryFee', (v) => v as String?),
        latitude: $checkedConvert('latitude', (v) => (v as num?)?.toDouble()),
        longitude: $checkedConvert('longitude', (v) => (v as num?)?.toDouble()),
        locationLabel: $checkedConvert('locationLabel', (v) => v as String?),
        locationSource: $checkedConvert('locationSource', (v) => v as String?),
        locationUpdatedAt: $checkedConvert(
          'locationUpdatedAt',
          (v) => v as String?,
        ),
        collectionRequired: $checkedConvert(
          'collectionRequired',
          (v) => v as bool?,
        ),
      );
      return val;
    });

ParcelEvent _$ParcelEventFromJson(Map<String, dynamic> json) =>
    $checkedCreate('ParcelEvent', json, ($checkedConvert) {
      final val = ParcelEvent(
        id: $checkedConvert('id', (v) => v as String),
        event: $checkedConvert('event', (v) => v as String),
        fromStatus: $checkedConvert('fromStatus', (v) => v as String?),
        toStatus: $checkedConvert('toStatus', (v) => v as String?),
        custody: $checkedConvert('custody', (v) => v as String?),
        locationLabel: $checkedConvert('locationLabel', (v) => v as String?),
        occurredAt: $checkedConvert('occurredAt', (v) => v as String),
      );
      return val;
    });

ParcelActions _$ParcelActionsFromJson(Map<String, dynamic> json) =>
    $checkedCreate('ParcelActions', json, ($checkedConvert) {
      final val = ParcelActions(
        edit: $checkedConvert('edit', (v) => v as bool),
        cancel: $checkedConvert('cancel', (v) => v as bool),
        requestAmendment: $checkedConvert('requestAmendment', (v) => v as bool),
        requestCancellation: $checkedConvert(
          'requestCancellation',
          (v) => v as bool,
        ),
      );
      return val;
    });

ParcelDetails _$ParcelDetailsFromJson(Map<String, dynamic> json) =>
    $checkedCreate('ParcelDetails', json, ($checkedConvert) {
      final val = ParcelDetails(
        parcel: $checkedConvert(
          'parcel',
          (v) => Parcel.fromJson(v as Map<String, dynamic>),
        ),
        events: $checkedConvert(
          'events',
          (v) => (v as List<dynamic>)
              .map((e) => ParcelEvent.fromJson(e as Map<String, dynamic>))
              .toList(),
        ),
        historyAvailable: $checkedConvert('historyAvailable', (v) => v as bool),
        actions: $checkedConvert(
          'actions',
          (v) => v == null
              ? null
              : ParcelActions.fromJson(v as Map<String, dynamic>),
        ),
      );
      return val;
    });

ParcelRequest _$ParcelRequestFromJson(Map<String, dynamic> json) =>
    $checkedCreate('ParcelRequest', json, ($checkedConvert) {
      final val = ParcelRequest(
        id: $checkedConvert('id', (v) => v as String),
        status: $checkedConvert('status', (v) => v as String),
        kind: $checkedConvert('kind', (v) => v as String),
        reason: $checkedConvert('reason', (v) => v as String),
        reviewReason: $checkedConvert('reviewReason', (v) => v as String?),
      );
      return val;
    });

PickupParcel _$PickupParcelFromJson(Map<String, dynamic> json) =>
    $checkedCreate('PickupParcel', json, ($checkedConvert) {
      final val = PickupParcel(
        id: $checkedConvert('id', (v) => v as String),
        shipmentId: $checkedConvert('shipmentId', (v) => v as String),
        receipt: $checkedConvert('receipt', (v) => v as String),
      );
      return val;
    });

Pickup _$PickupFromJson(Map<String, dynamic> json) =>
    $checkedCreate('Pickup', json, ($checkedConvert) {
      final val = Pickup(
        id: $checkedConvert('id', (v) => v as String),
        method: $checkedConvert('method', (v) => v as String),
        status: $checkedConvert('status', (v) => v as String),
        revision: $checkedConvert('revision', (v) => (v as num).toInt()),
        preferredFrom: $checkedConvert('preferredFrom', (v) => v as String?),
        preferredTo: $checkedConvert('preferredTo', (v) => v as String?),
        proposedFrom: $checkedConvert('proposedFrom', (v) => v as String?),
        proposedTo: $checkedConvert('proposedTo', (v) => v as String?),
        confirmedFrom: $checkedConvert('confirmedFrom', (v) => v as String?),
        confirmedTo: $checkedConvert('confirmedTo', (v) => v as String?),
        pickupAddress: $checkedConvert('pickupAddress', (v) => v as String),
        notes: $checkedConvert('notes', (v) => v as String?),
        latitude: $checkedConvert('latitude', (v) => (v as num?)?.toDouble()),
        longitude: $checkedConvert('longitude', (v) => (v as num?)?.toDouble()),
        parcels: $checkedConvert(
          'parcels',
          (v) => (v as List<dynamic>?)
              ?.map((e) => PickupParcel.fromJson(e as Map<String, dynamic>))
              .toList(),
        ),
      );
      return val;
    });

Employee _$EmployeeFromJson(Map<String, dynamic> json) =>
    $checkedCreate('Employee', json, ($checkedConvert) {
      final val = Employee(
        id: $checkedConvert('id', (v) => v as String),
        userId: $checkedConvert('userId', (v) => v as String),
        role: $checkedConvert('role', (v) => v as String),
        status: $checkedConvert('status', (v) => v as String),
        permissions: $checkedConvert(
          'permissions',
          (v) => (v as List<dynamic>).map((e) => e as String).toList(),
        ),
        fullName: $checkedConvert('fullName', (v) => v as String),
        email: $checkedConvert('email', (v) => v as String?),
      );
      return val;
    });

EmployeeUpdate _$EmployeeUpdateFromJson(Map<String, dynamic> json) =>
    $checkedCreate('EmployeeUpdate', json, ($checkedConvert) {
      final val = EmployeeUpdate(
        id: $checkedConvert('id', (v) => v as String),
        status: $checkedConvert('status', (v) => v as String),
        permissions: $checkedConvert(
          'permissions',
          (v) => (v as List<dynamic>).map((e) => e as String).toList(),
        ),
      );
      return val;
    });

Invitation _$InvitationFromJson(Map<String, dynamic> json) =>
    $checkedCreate('Invitation', json, ($checkedConvert) {
      final val = Invitation(
        id: $checkedConvert('id', (v) => v as String),
        email: $checkedConvert('email', (v) => v as String),
        role: $checkedConvert('role', (v) => v as String),
        permissions: $checkedConvert(
          'permissions',
          (v) => (v as List<dynamic>).map((e) => e as String).toList(),
        ),
        expiresAt: $checkedConvert('expiresAt', (v) => v as String),
        acceptedAt: $checkedConvert('acceptedAt', (v) => v as String?),
        revokedAt: $checkedConvert('revokedAt', (v) => v as String?),
        token: $checkedConvert('token', (v) => v as String?),
      );
      return val;
    });

Activity _$ActivityFromJson(Map<String, dynamic> json) =>
    $checkedCreate('Activity', json, ($checkedConvert) {
      final val = Activity(
        id: $checkedConvert('id', (v) => v as String),
        actorId: $checkedConvert('actorId', (v) => v as String),
        action: $checkedConvert('action', (v) => v as String),
        createdAt: $checkedConvert('createdAt', (v) => v as String),
      );
      return val;
    });

ImportRow _$ImportRowFromJson(Map<String, dynamic> json) =>
    $checkedCreate('ImportRow', json, ($checkedConvert) {
      final val = ImportRow(
        rowNumber: $checkedConvert('rowNumber', (v) => (v as num).toInt()),
        errors: $checkedConvert(
          'errors',
          (v) => (v as List<dynamic>).map((e) => e as String).toList(),
        ),
        preview: $checkedConvert(
          'preview',
          (v) => v == null
              ? null
              : PricingPreview.fromJson(v as Map<String, dynamic>),
        ),
      );
      return val;
    });

ImportPreview _$ImportPreviewFromJson(Map<String, dynamic> json) =>
    $checkedCreate('ImportPreview', json, ($checkedConvert) {
      final val = ImportPreview(
        importId: $checkedConvert('importId', (v) => v as String),
        rows: $checkedConvert(
          'rows',
          (v) => (v as List<dynamic>)
              .map((e) => ImportRow.fromJson(e as Map<String, dynamic>))
              .toList(),
        ),
        validCount: $checkedConvert('validCount', (v) => (v as num).toInt()),
        invalidCount: $checkedConvert(
          'invalidCount',
          (v) => (v as num).toInt(),
        ),
      );
      return val;
    });

ImportResult _$ImportResultFromJson(Map<String, dynamic> json) =>
    $checkedCreate('ImportResult', json, ($checkedConvert) {
      final val = ImportResult(
        created: $checkedConvert('created', (v) => (v as num).toInt()),
        rejected: $checkedConvert('rejected', (v) => (v as num).toInt()),
        duplicates: $checkedConvert('duplicates', (v) => (v as num).toInt()),
        parcels: $checkedConvert(
          'parcels',
          (v) => (v as List<dynamic>).map((e) => e as String).toList(),
        ),
      );
      return val;
    });

StatementEntry _$StatementEntryFromJson(Map<String, dynamic> json) =>
    $checkedCreate('StatementEntry', json, ($checkedConvert) {
      final val = StatementEntry(
        id: $checkedConvert('id', (v) => v as String),
        kind: $checkedConvert('kind', (v) => v as String),
        amount: $checkedConvert('amount', (v) => v as String),
        currency: $checkedConvert('currency', (v) => v as String),
        reason: $checkedConvert('reason', (v) => v as String?),
        createdAt: $checkedConvert('createdAt', (v) => v as String),
        shipmentId: $checkedConvert('shipmentId', (v) => v as String?),
      );
      return val;
    });

Balance _$BalanceFromJson(Map<String, dynamic> json) =>
    $checkedCreate('Balance', json, ($checkedConvert) {
      final val = Balance(
        currency: $checkedConvert('currency', (v) => v as String),
        balance: $checkedConvert('balance', (v) => v as String),
        eligible: $checkedConvert('eligible', (v) => v as String),
        paid: $checkedConvert('paid', (v) => v as String),
      );
      return val;
    });

Statement _$StatementFromJson(Map<String, dynamic> json) =>
    $checkedCreate('Statement', json, ($checkedConvert) {
      final val = Statement(
        items: $checkedConvert(
          'items',
          (v) => (v as List<dynamic>)
              .map((e) => StatementEntry.fromJson(e as Map<String, dynamic>))
              .toList(),
        ),
        balances: $checkedConvert(
          'balances',
          (v) => (v as List<dynamic>)
              .map((e) => Balance.fromJson(e as Map<String, dynamic>))
              .toList(),
        ),
        page: $checkedConvert('page', (v) => (v as num).toInt()),
        pageSize: $checkedConvert('pageSize', (v) => (v as num).toInt()),
        hasNext: $checkedConvert('hasNext', (v) => v as bool),
      );
      return val;
    });

SettlementRequest _$SettlementRequestFromJson(Map<String, dynamic> json) =>
    $checkedCreate('SettlementRequest', json, ($checkedConvert) {
      final val = SettlementRequest(
        id: $checkedConvert('id', (v) => v as String),
        currency: $checkedConvert('currency', (v) => v as String),
        notes: $checkedConvert('notes', (v) => v as String?),
        status: $checkedConvert('status', (v) => v as String),
        createdAt: $checkedConvert('createdAt', (v) => v as String),
      );
      return val;
    });

ParcelLabel _$ParcelLabelFromJson(Map<String, dynamic> json) =>
    $checkedCreate('ParcelLabel', json, ($checkedConvert) {
      final val = ParcelLabel(
        trackingNumber: $checkedConvert('trackingNumber', (v) => v as String),
        qrSvg: $checkedConvert('qrSvg', (v) => v as String),
      );
      return val;
    });

ImportTemplate _$ImportTemplateFromJson(Map<String, dynamic> json) =>
    $checkedCreate('ImportTemplate', json, ($checkedConvert) {
      final val = ImportTemplate(
        filename: $checkedConvert('filename', (v) => v as String),
        fileBase64: $checkedConvert('fileBase64', (v) => v as String),
      );
      return val;
    });
