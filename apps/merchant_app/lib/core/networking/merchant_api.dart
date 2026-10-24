import 'api_client.dart';
import 'models.dart';

typedef Json = Map<String, Object?>;

class MerchantApi {
  MerchantApi(this.client);
  final ApiClient client;
  Future<Json> _read(String path, {Json? query}) async =>
      objectJson(await client.request(path, query: query));
  Future<Json> _write(
    String path,
    Json input, {
    String method = 'POST',
    bool authenticated = true,
  }) async => objectJson(
    await client.request(
      path,
      method: method,
      data: input,
      authenticated: authenticated,
    ),
  );
  List<T> _items<T>(Json value, T Function(Json) parse) {
    final items = value['items'];
    if (items is! List<Object?>) throw const FormatException('Invalid items');
    return items.map((item) => parse(objectJson(item))).toList(growable: false);
  }

  PageResult<T> _page<T>(Json json, T Function(Json) parse) => PageResult(
    items: _items(json, parse),
    page: json['page']! as int,
    pageSize: json['pageSize']! as int,
    hasNext: json['hasNext']! as bool,
  );
  String _id(String id) => Uri.encodeComponent(id);
  Future<MerchantContext> me() async =>
      MerchantContext.fromJson(await _read('/merchant/me'));
  Future<void> activate(String token, String name, String password) async {
    final result = await _write('/merchant/invitations/accept', {
      'token': token,
      'name': name,
      'password': password,
    }, authenticated: false);
    if (result['accepted'] != true) {
      throw const FormatException('Invalid activation');
    }
  }

  Future<List<Zone>> zones() async =>
      _items(await _read('/merchant/zones'), Zone.fromJson);
  Future<PricingPreview> preview(String zoneId, String amount) async =>
      PricingPreview.fromJson(
        objectJson(
          (await _write('/merchant/pricing-preview', {
            'zoneId': zoneId,
            'finalCustomerAmount': amount,
          }))['preview'],
        ),
      );
  Future<PageResult<Parcel>> parcels({
    int page = 1,
    String search = '',
    String? status,
  }) async => _page(
    await _read(
      '/merchant/parcels',
      query: {
        'page': page,
        'pageSize': 25,
        'search': search,
        if (status != null && status.isNotEmpty) 'status': status,
      },
    ),
    Parcel.fromJson,
  );
  Future<ParcelDetails> parcel(String id) async =>
      ParcelDetails.fromJson(await _read('/merchant/parcels/${_id(id)}'));
  Future<Parcel> createParcel(Json input) async => Parcel.fromJson(
    objectJson((await _write('/merchant/parcels', input))['parcel']),
  );
  Future<Parcel> editParcel(String id, Json input) async => Parcel.fromJson(
    objectJson(
      (await _write(
        '/merchant/parcels/${_id(id)}',
        input,
        method: 'PATCH',
      ))['parcel'],
    ),
  );
  Future<Parcel> cancelParcel(String id, int revision, String reason) async =>
      Parcel.fromJson(
        objectJson(
          (await _write('/merchant/parcels/${_id(id)}/cancel', {
            'revision': revision,
            'reason': reason,
          }))['parcel'],
        ),
      );
  Future<void> amendment(String id, Json input) async {
    await _write('/merchant/parcels/${_id(id)}/amendment-requests', input);
  }

  Future<void> cancellationRequest(String id, Json input) async {
    await _write('/merchant/parcels/${_id(id)}/cancellation-requests', input);
  }

  Future<List<ParcelRequest>> parcelRequests(String id) async => _items(
    await _read('/merchant/parcels/${_id(id)}/requests'),
    ParcelRequest.fromJson,
  );
  Future<ParcelLabel> label(String id) async =>
      ParcelLabel.fromJson(await _read('/merchant/parcels/${_id(id)}/label'));
  Future<PageResult<Pickup>> pickups({int page = 1}) async => _page(
    await _read('/merchant/pickups', query: {'page': page, 'pageSize': 25}),
    Pickup.fromJson,
  );
  Future<Pickup> pickup(String id) async => Pickup.fromJson(
    objectJson((await _read('/merchant/pickups/${_id(id)}'))['pickup']),
  );
  Future<Pickup> createPickup(Json input) async => Pickup.fromJson(
    objectJson((await _write('/merchant/pickups', input))['pickup']),
  );
  Future<Pickup> pickupAction(String id, int revision, String action) async =>
      Pickup.fromJson(
        objectJson(
          (await _write('/merchant/pickups/${_id(id)}/action', {
            'revision': revision,
            'action': action,
          }))['pickup'],
        ),
      );
  Future<ImportTemplate> template() async =>
      ImportTemplate.fromJson(await _read('/merchant/imports/template'));
  Future<ImportPreview> importPreview(String fileBase64) async =>
      ImportPreview.fromJson(
        await _write('/merchant/imports/preview', {'fileBase64': fileBase64}),
      );
  Future<ImportResult> importConfirm(String id, String key) async =>
      ImportResult.fromJson(
        await _write('/merchant/imports/${_id(id)}/confirm', {
          'idempotencyKey': key,
        }),
      );
  Future<List<Employee>> employees() async =>
      _items(await _read('/merchant/employees'), Employee.fromJson);
  Future<List<Invitation>> invitations() async =>
      _items(await _read('/merchant/invitations'), Invitation.fromJson);
  Future<Invitation> invite(String email, List<String> permissions) async =>
      Invitation.fromJson(
        await _write('/merchant/invitations', {
          'email': email,
          'permissions': permissions,
        }),
      );
  Future<EmployeeUpdate> updateEmployee(
    String id,
    List<String> permissions,
    bool active,
  ) async => EmployeeUpdate.fromJson(
    await _write('/merchant/employees/${_id(id)}', {
      'permissions': permissions,
      'active': active,
    }, method: 'PATCH'),
  );
  Future<void> revokeInvitation(String id) async {
    await _write('/merchant/invitations/${_id(id)}', {}, method: 'DELETE');
  }

  Future<List<Activity>> activity() async =>
      _items(await _read('/merchant/activity'), Activity.fromJson);
  Future<Statement> statement({int page = 1}) async => Statement.fromJson(
    await _read('/merchant/statement', query: {'page': page, 'pageSize': 25}),
  );
  Future<void> requestSettlement(
    String key,
    String currency,
    String? notes,
  ) async {
    await _write('/merchant/settlement-requests', {
      'idempotencyKey': key,
      'currency': currency,
      'notes': notes,
    });
  }

  Future<PageResult<SettlementRequest>> settlements({int page = 1}) async =>
      _page(
        await _read(
          '/merchant/settlement-requests',
          query: {'page': page, 'pageSize': 25},
        ),
        SettlementRequest.fromJson,
      );
}
