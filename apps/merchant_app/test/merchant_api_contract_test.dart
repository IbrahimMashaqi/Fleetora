import 'package:dio/dio.dart';
import 'package:fleetora_merchant/core/config/app_config.dart';
import 'package:fleetora_merchant/core/networking/api_client.dart';
import 'package:fleetora_merchant/core/networking/merchant_api.dart';
import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:json_annotation/json_annotation.dart';

import 'support/api_test_support.dart';

void main() {
  late MemoryTokens tokens;
  late ApiClient client;
  late MerchantApi api;
  late List<RequestOptions> requests;
  late Object? response;
  setUp(() {
    tokens = MemoryTokens()
      ..value = const Tokens(
        accessToken: 'fixture-access',
        refreshToken: 'fixture-refresh',
      );
    requests = [];
    final dio = Dio()
      ..httpClientAdapter = Adapter((request) async {
        requests.add(request);
        return reply(response);
      });
    client = ApiClient(
      AppConfig('https://fixture.example.invalid'),
      tokens,
      dio: dio,
    );
    api = MerchantApi(client);
  });
  tearDown(() => client.dispose());

  test('activation sends only invited identity fields without bearer or company selection', () async {
    response = {'accepted': true, 'email': 'owner@example.invalid'};
    await client.restore();
    await api.activate('fixture-invitation', 'Owner', 'fixture-password');
    expect(requests.single.path, '/merchant/invitations/accept');
    expect(requests.single.method, 'POST');
    expect(requests.single.data, {
      'token': 'fixture-invitation',
      'name': 'Owner',
      'password': 'fixture-password',
    });
    expect(requests.single.headers.containsKey('Authorization'), isFalse);
  });

  test('employee update accepts public membership fields without private account data', () async {
    response = {
      'id': 'membership',
      'status': 'ACTIVE',
      'permissions': ['PARCEL_VIEW'],
    };
    final result = await api.updateEmployee('membership', [
      'PARCEL_VIEW',
    ], true);
    expect(result.id, 'membership');
    expect(result.status, 'ACTIVE');
    expect(result.permissions, ['PARCEL_VIEW']);
    expect(requests.single.method, 'PATCH');
    expect(requests.single.data, {
      'permissions': ['PARCEL_VIEW'],
      'active': true,
    });
  });

  test('activity projects typed public actor fields and ignores internal audit details', () async {
    response = {
      'items': [
        {
          'id': 'event',
          'actorId': 'owner',
          'action': 'INVITATION_ISSUED',
          'createdAt': '2026-10-22T10:00:00Z',
          'details': {'internal': 'excluded'},
        },
      ],
    };
    final activity = (await api.activity()).single;
    expect(activity, isA<Activity>());
    expect(
      [activity.id, activity.actorId, activity.action, activity.createdAt],
      ['event', 'owner', 'INVITATION_ISSUED', '2026-10-22T10:00:00Z'],
    );
    response = {
      'items': [
        {
          'id': 'event',
          'action': 'MISSING_ACTOR',
          'createdAt': '2026-10-22T10:00:00Z',
        },
      ],
    };
    await expectLater(api.activity(), throwsA(isA<CheckedFromJsonException>()));
  });

  test(
    'server pricing receives the unchanged inclusive final amount',
    () async {
      response = {
        'preview': {
          'finalCustomerAmount': '150.00',
          'baseDeliveryFee': '15.00',
          'discount': '0.00',
          'promotionDiscount': '0.00',
          'deliveryFee': '15.00',
          'expectedMerchantProceeds': '135.00',
          'currency': 'ILS',
          'pricingVersion': 'fixture-version',
          'deliveryZoneId': 'zone',
          'pricingPlanId': 'plan',
          'zoneName': 'Fixture zone',
          'city': 'Fixture city',
          'planName': 'Fixture plan',
          'feePayer': 'MERCHANT',
        },
      };
      final quote = await api.preview('zone', '150.00');
      expect(requests.single.data, {
        'zoneId': 'zone',
        'finalCustomerAmount': '150.00',
      });
      expect(quote.finalCustomerAmount, '150.00');
      expect(quote.deliveryFee, '15.00');
      expect(quote.expectedMerchantProceeds, '135.00');
    },
  );

  test(
    'malformed successful parcel and pricing payloads never become typed state',
    () async {
      response = {'items': null, 'page': 1, 'pageSize': 25, 'hasNext': false};
      await expectLater(api.parcels(), throwsA(isA<FormatException>()));
      response = {
        'preview': {'finalCustomerAmount': 150},
      };
      await expectLater(
        api.preview('zone', '150.00'),
        throwsA(isA<CheckedFromJsonException>()),
      );
    },
  );

  test(
    'explicit import confirmation retries preserve the wire idempotency key',
    () async {
      response = {
        'created': 1,
        'rejected': 0,
        'duplicates': 0,
        'parcels': ['parcel'],
      };
      final first = await api.importConfirm('import', 'stable-key');
      final retry = await api.importConfirm('import', 'stable-key');
      expect(first.parcels, ['parcel']);
      expect(retry.parcels, first.parcels);
      expect(requests.map((request) => request.path), [
        '/merchant/imports/import/confirm',
        '/merchant/imports/import/confirm',
      ]);
      expect(requests.map((request) => request.method), ['POST', 'POST']);
      expect(requests.map((request) => request.data), [
        {'idempotencyKey': 'stable-key'},
        {'idempotencyKey': 'stable-key'},
      ]);
    },
  );
}
