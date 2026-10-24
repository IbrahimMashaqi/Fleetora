import 'package:fleetora_merchant/app/localization/generated/app_localizations.dart';
import 'package:fleetora_merchant/core/authentication/session.dart';
import 'package:fleetora_merchant/core/networking/merchant_api.dart';
import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

MerchantContext merchantFixture({
  bool owner = false,
  List<String> permissions = const [],
}) => MerchantContext(
  userId: 'user-1',
  merchantId: 'merchant-1',
  companyId: 'company-1',
  membershipId: 'member-1',
  owner: owner,
  permissions: permissions,
  merchant: const Business(
    id: 'merchant-1',
    name: 'Olive shop',
    pickupAddress: 'Market street',
    city: 'Ramallah',
    phone: '0591234567',
  ),
  company: const Company(id: 'company-1', name: 'Delivery company'),
);

Widget testPage(
  Widget page,
  MerchantApi api, {
  bool owner = false,
  List<String> permissions = const [],
  String language = 'en',
}) => ProviderScope(
  overrides: [
    merchantProvider.overrideWithValue(
      merchantFixture(owner: owner, permissions: permissions),
    ),
    apiProvider.overrideWithValue(api),
  ],
  child: MaterialApp(
    locale: Locale(language),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(body: page),
  ),
);

class AccountApiFake implements MerchantApi {
  final statementPages = <int>[];
  final settlementPages = <int>[];
  final settlementCalls = <({String key, String currency, String? notes})>[];
  Future<void> Function()? settlementBehavior;
  int employeeReads = 0;
  int invitationReads = 0;
  int activityReads = 0;
  final invitationsIssued = <List<String>>[];
  final revoked = <String>[];
  final employeeUpdates =
      <({String id, List<String> permissions, bool active})>[];
  Statement statementValue = const Statement(
    items: [],
    balances: [
      Balance(
        currency: 'USD',
        balance: '9007199254740993.12',
        eligible: '100.00',
        paid: '5.00',
      ),
    ],
    page: 1,
    pageSize: 25,
    hasNext: false,
  );
  List<Employee> employeeValues = const [];
  List<Invitation> invitationValues = const [];

  @override
  Future<Statement> statement({int page = 1}) async {
    statementPages.add(page);
    return Statement(
      items: statementValue.items,
      balances: statementValue.balances,
      page: page,
      pageSize: 25,
      hasNext: page == 1 && statementValue.hasNext,
    );
  }

  @override
  Future<PageResult<SettlementRequest>> settlements({int page = 1}) async {
    settlementPages.add(page);
    return PageResult(
      items: const [],
      page: page,
      pageSize: 25,
      hasNext: false,
    );
  }

  @override
  Future<void> requestSettlement(
    String key,
    String currency,
    String? notes,
  ) async {
    settlementCalls.add((key: key, currency: currency, notes: notes));
    await settlementBehavior?.call();
  }

  @override
  Future<List<Employee>> employees() async {
    employeeReads++;
    return employeeValues;
  }

  @override
  Future<List<Invitation>> invitations() async {
    invitationReads++;
    return invitationValues;
  }

  @override
  Future<List<Activity>> activity() async {
    activityReads++;
    return const [];
  }

  @override
  Future<Invitation> invite(String email, List<String> permissions) async {
    invitationsIssued.add(permissions);
    return Invitation(
      id: 'issued-1',
      email: email,
      role: 'EMPLOYEE',
      permissions: permissions,
      expiresAt: '2099-10-22T10:00:00Z',
      token: 'one-time-sensitive-token',
    );
  }

  @override
  Future<void> revokeInvitation(String id) async {
    revoked.add(id);
  }

  @override
  Future<EmployeeUpdate> updateEmployee(
    String id,
    List<String> permissions,
    bool active,
  ) async {
    employeeUpdates.add((id: id, permissions: permissions, active: active));
    return EmployeeUpdate(
      id: id,
      status: active ? 'ACTIVE' : 'REVOKED',
      permissions: permissions,
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Unexpected API call: ${invocation.memberName}');
}
