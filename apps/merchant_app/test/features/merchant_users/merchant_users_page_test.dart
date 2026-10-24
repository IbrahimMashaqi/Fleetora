import 'package:fleetora_merchant/core/networking/models.dart';
import 'package:fleetora_merchant/features/merchant_users/activity_page.dart';
import 'package:fleetora_merchant/features/merchant_users/merchant_users_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../accounting/finance_test_support.dart';

void main() {
  const invitation = Invitation(
    id: 'invite-1',
    email: 'employee@example.com',
    role: 'EMPLOYEE',
    permissions: [],
    expiresAt: '2099-10-22T10:00:00Z',
  );

  test(
    'invitation status respects acceptance, revocation and exact expiry',
    () {
      expect(invitationState(invitation, now: DateTime.utc(2026)), 'pending');
      expect(
        invitationState(invitation, now: DateTime.utc(2099, 10, 22, 10)),
        'expired',
      );
      const revoked = Invitation(
        id: 'id',
        email: 'employee@example.com',
        role: 'EMPLOYEE',
        permissions: [],
        expiresAt: '2099-10-22T10:00:00Z',
        revokedAt: '2026-10-22T10:00:00Z',
      );
      expect(invitationState(revoked), 'revoked');
    },
  );

  testWidgets('employee cannot fetch team, invitation or owner activity data', (
    tester,
  ) async {
    final api = AccountApiFake();
    await tester.pumpWidget(
      testPage(const MerchantUsersPage(), api, permissions: ['FINANCE_VIEW']),
    );
    await tester.pumpAndSettle();
    expect(find.text('Owner access is required.'), findsOneWidget);
    expect(api.employeeReads, 0);
    expect(api.invitationReads, 0);
    await tester.pumpWidget(testPage(const ActivityPage(), api));
    await tester.pumpAndSettle();
    expect(api.activityReads, 0);
  });

  testWidgets(
    'new invitation has nine explicit permissions and no default financial access',
    (tester) async {
      final api = AccountApiFake();
      await tester.pumpWidget(
        testPage(const MerchantUsersPage(), api, owner: true),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Invite an employee'));
      await tester.pumpAndSettle();
      final choices = tester.widgetList<CheckboxListTile>(
        find.byType(CheckboxListTile),
      );
      expect(choices, hasLength(9));
      expect(choices.every((choice) => choice.value == false), isTrue);
      await tester.enterText(
        find.byType(TextFormField),
        'employee@example.com',
      );
      tester.testTextInput.hide();
      await tester.pumpAndSettle();
      final inviteButton = find.widgetWithText(
        FilledButton,
        'Create invitation',
      );
      await Scrollable.ensureVisible(
        tester.element(inviteButton),
        alignment: 0.5,
      );
      await tester.pumpAndSettle();
      await tester.tap(inviteButton);
      await tester.pumpAndSettle();
      expect(api.invitationsIssued.single, isEmpty);
      await tester.ensureVisible(find.text('one-time-sensitive-token'));
      expect(find.text('one-time-sensitive-token'), findsOneWidget);
      expect(find.textContaining('No email was sent.'), findsOneWidget);
      await tester.ensureVisible(find.text('Dismiss token'));
      await tester.tap(find.text('Dismiss token'));
      await tester.pumpAndSettle();
      expect(find.text('one-time-sensitive-token'), findsNothing);
    },
  );

  testWidgets(
    'invitation history never displays a token and revocation needs confirmation',
    (tester) async {
      final api = AccountApiFake();
      api.invitationValues = const [
        Invitation(
          id: 'invite-1',
          email: 'employee@example.com',
          role: 'EMPLOYEE',
          permissions: [],
          expiresAt: '2099-10-22T10:00:00Z',
          token: 'token-from-list-must-not-render',
        ),
      ];
      await tester.pumpWidget(
        testPage(const MerchantUsersPage(), api, owner: true),
      );
      await tester.pumpAndSettle();
      expect(find.text('token-from-list-must-not-render'), findsNothing);
      await tester.ensureVisible(find.text('Revoke invitation'));
      await tester.tap(find.text('Revoke invitation'));
      await tester.pumpAndSettle();
      expect(api.revoked, isEmpty);
      await tester.tap(find.text('Back'));
      await tester.pumpAndSettle();
      expect(api.revoked, isEmpty);
      await tester.tap(find.text('Revoke invitation'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();
      expect(api.revoked, ['invite-1']);
    },
  );

  testWidgets(
    'owner can explicitly change employee finance access and active status',
    (tester) async {
      final api = AccountApiFake();
      api.employeeValues = const [
        Employee(
          id: 'owner',
          userId: 'owner-user',
          role: 'OWNER',
          status: 'ACTIVE',
          permissions: [],
          fullName: 'Owner',
        ),
        Employee(
          id: 'staff',
          userId: 'staff-user',
          role: 'EMPLOYEE',
          status: 'ACTIVE',
          permissions: ['PARCEL_VIEW'],
          fullName: 'Staff',
        ),
      ];
      await tester.pumpWidget(
        testPage(const MerchantUsersPage(), api, owner: true),
      );
      await tester.pumpAndSettle();
      expect(find.byTooltip('Edit employee access'), findsOneWidget);
      await tester.tap(find.byTooltip('Edit employee access'));
      await tester.pumpAndSettle();
      final finance = find.widgetWithText(
        CheckboxListTile,
        'View financial statements',
      );
      await tester.ensureVisible(finance);
      await tester.tap(finance);
      await tester.ensureVisible(find.byType(SwitchListTile));
      await tester.tap(find.byType(SwitchListTile));
      await tester.tap(find.text('Save access'));
      await tester.pumpAndSettle();
      expect(api.employeeUpdates, isEmpty);
      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();
      expect(api.employeeUpdates.single.id, 'staff');
      expect(api.employeeUpdates.single.active, isFalse);
      expect(
        api.employeeUpdates.single.permissions,
        containsAll(['PARCEL_VIEW', 'FINANCE_VIEW']),
      );
    },
  );
}
