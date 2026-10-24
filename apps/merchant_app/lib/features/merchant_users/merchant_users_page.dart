import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/copy.dart';
import '../../core/authentication/session.dart';
import '../../core/networking/models.dart';
import '../../core/widgets/feedback.dart';
import '../../core/formatting/value_format.dart';

class MerchantTeam {
  const MerchantTeam(this.employees, this.invitations);
  final List<Employee> employees;
  final List<Invitation> invitations;
}

final merchantTeamProvider = FutureProvider.autoDispose<MerchantTeam>((
  ref,
) async {
  if (!ref.watch(merchantProvider).owner) {
    throw StateError('Owner access required');
  }
  final api = ref.watch(apiProvider);
  final result = await (api.employees(), api.invitations()).wait;
  return MerchantTeam(result.$1, result.$2);
});

class PermissionPicker extends StatelessWidget {
  const PermissionPicker({
    super.key,
    required this.selected,
    required this.onChanged,
    this.enabled = true,
  });
  final Set<String> selected;
  final ValueChanged<Set<String>> onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      for (final permission in merchantPermissions)
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(context.tr('permission_$permission')),
          value: selected.contains(permission),
          onChanged: enabled
              ? (checked) => onChanged(
                  checked == true
                      ? {...selected, permission}
                      : ({...selected}..remove(permission)),
                )
              : null,
        ),
    ],
  );
}

class MerchantUsersPage extends ConsumerStatefulWidget {
  const MerchantUsersPage({super.key});
  @override
  ConsumerState<MerchantUsersPage> createState() => _MerchantUsersPageState();
}

class _MerchantUsersPageState extends ConsumerState<MerchantUsersPage> {
  Invitation? _issued;
  String? _revoking;

  Future<void> _revoke(Invitation invitation) async {
    if (_revoking != null) return;
    setState(() => _revoking = invitation.id);
    final confirmed = await showConfirmation(
      context,
      title: context.tr('revokeInvitation'),
      message: context.tr('revokeInvitationConfirmation'),
    );
    if (!mounted) return;
    if (!confirmed) {
      setState(() => _revoking = null);
      return;
    }
    try {
      await ref.read(apiProvider).revokeInvitation(invitation.id);
      if (!mounted) return;
      if (_issued?.id == invitation.id) _issued = null;
      ref.invalidate(merchantTeamProvider);
      showSuccess(context);
    } on Object catch (error) {
      if (mounted) showFailure(context, error);
    } finally {
      if (mounted) setState(() => _revoking = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!ref.watch(merchantProvider).owner) {
      return PageBody(children: [Text(context.tr('ownerAccessRequired'))]);
    }
    final team = ref.watch(merchantTeamProvider);
    final locale = Localizations.localeOf(context).toLanguageTag();
    return PageBody(
      children: [
        Text(
          context.tr('merchantUsers'),
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        _InvitationForm(
          onIssued: (invitation) => setState(() => _issued = invitation),
        ),
        if (_issued != null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    context.tr('secureInvitationHandoff'),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  Text(_issued!.email, textDirection: TextDirection.ltr),
                  Text(context.tr('invitationTokenHelp')),
                  const SizedBox(height: 12),
                  SelectableText(
                    _issued!.token!,
                    textDirection: TextDirection.ltr,
                  ),
                  TextButton(
                    onPressed: () => setState(() => _issued = null),
                    child: Text(context.tr('dismissInvitationToken')),
                  ),
                ],
              ),
            ),
          ),
        team.when(
          skipLoadingOnRefresh: false,
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stack) => Column(
            children: [
              ErrorNotice(error: error),
              TextButton(
                onPressed: () => ref.invalidate(merchantTeamProvider),
                child: Text(context.tr('retry')),
              ),
            ],
          ),
          data: (data) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                context.tr('employees'),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (data.employees.isEmpty) const EmptyNotice(),
              for (final employee in data.employees)
                Card(
                  child: ListTile(
                    title: Text(employee.fullName),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (employee.email != null)
                          Text(
                            employee.email!,
                            textDirection: TextDirection.ltr,
                          ),
                        Text(
                          '${context.tr('role_${employee.role}')} · ${context.tr('status_${employee.status}')}',
                        ),
                      ],
                    ),
                    trailing: employee.role == 'EMPLOYEE'
                        ? IconButton(
                            tooltip: context.tr('editEmployeeAccess'),
                            icon: const Icon(Icons.manage_accounts_outlined),
                            onPressed: () async {
                              final saved = await showDialog<bool>(
                                context: context,
                                useRootNavigator: false,
                                builder: (context) =>
                                    _EmployeeEditor(employee: employee),
                              );
                              if (saved == true && mounted) {
                                ref.invalidate(merchantTeamProvider);
                              }
                            },
                          )
                        : null,
                  ),
                ),
              const SizedBox(height: 20),
              Text(
                context.tr('invitations'),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              if (data.invitations.isEmpty) const EmptyNotice(),
              for (final invitation in data.invitations)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          invitation.email,
                          textDirection: TextDirection.ltr,
                        ),
                        Text(
                          context.tr(
                            'invitation_${invitationState(invitation)}',
                          ),
                        ),
                        Text(
                          '${context.tr('invitationExpires')}: ${financialDate(invitation.expiresAt, locale)}',
                        ),
                        if (invitationState(invitation) == 'pending')
                          TextButton(
                            onPressed: _revoking == null
                                ? () => _revoke(invitation)
                                : null,
                            child: Text(context.tr('revokeInvitation')),
                          ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: () => ref.invalidate(merchantTeamProvider),
                icon: const Icon(Icons.refresh),
                label: Text(context.tr('refreshTeam')),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

String invitationState(Invitation invitation, {DateTime? now}) {
  if (invitation.acceptedAt != null) return 'accepted';
  if (invitation.revokedAt != null) return 'revoked';
  if (!DateTime.parse(invitation.expiresAt).isAfter(now ?? DateTime.now())) {
    return 'expired';
  }
  return 'pending';
}

class _InvitationForm extends ConsumerStatefulWidget {
  const _InvitationForm({required this.onIssued});
  final ValueChanged<Invitation> onIssued;
  @override
  ConsumerState<_InvitationForm> createState() => _InvitationFormState();
}

class _InvitationFormState extends ConsumerState<_InvitationForm> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  Set<String> _permissions = {};
  bool _busy = false;
  Object? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _invite() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(apiProvider)
          .invite(_email.text.trim(), _permissions.toList());
      if (!mounted) return;
      if (result.token == null || result.token!.isEmpty) {
        throw const FormatException('Missing issued token');
      }
      widget.onIssued(result);
      _email.clear();
      _permissions = {};
      ref.invalidate(merchantTeamProvider);
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => ExpansionTile(
    title: Text(context.tr('inviteEmployee')),
    maintainState: true,
    children: [
      Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextFormField(
              controller: _email,
              decoration: InputDecoration(
                labelText: context.tr('employeeEmail'),
              ),
              keyboardType: TextInputType.emailAddress,
              textDirection: TextDirection.ltr,
              autocorrect: false,
              enabled: !_busy,
              maxLength: 254,
              validator: (value) =>
                  value != null &&
                      RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                          .hasMatch(value.trim())
                  ? null
                  : context.tr('validEmployeeEmail'),
            ),
            Text(context.tr('explicitPermissionHelp')),
            PermissionPicker(
              selected: _permissions,
              enabled: !_busy,
              onChanged: (permissions) =>
                  setState(() => _permissions = permissions),
            ),
            if (_error != null) ErrorNotice(error: _error!),
            SubmitButton(
              busy: _busy,
              onPressed: _invite,
              label: context.tr('createEmployeeInvitation'),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    ],
  );
}

class _EmployeeEditor extends ConsumerStatefulWidget {
  const _EmployeeEditor({required this.employee});
  final Employee employee;
  @override
  ConsumerState<_EmployeeEditor> createState() => _EmployeeEditorState();
}

class _EmployeeEditorState extends ConsumerState<_EmployeeEditor> {
  late Set<String> _permissions = widget.employee.permissions.toSet();
  late bool _active = widget.employee.status == 'ACTIVE';
  bool _busy = false;
  bool _confirming = false;
  Object? _error;

  Future<void> _save() async {
    if (_busy || _confirming) return;
    setState(() => _confirming = true);
    final confirmed = await showConfirmation(
      context,
      title: context.tr('saveEmployeeAccess'),
      message: context.tr('employeeAccessConfirmation'),
    );
    if (!mounted) return;
    setState(() => _confirming = false);
    if (!confirmed) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(apiProvider)
          .updateEmployee(widget.employee.id, _permissions.toList(), _active);
      if (mounted) Navigator.pop(context, true);
    } on Object catch (error) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = error;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy && !_confirming,
    child: AlertDialog(
      title: Text(widget.employee.fullName),
      content: SizedBox(
        width: 440,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(context.tr('explicitPermissionHelp')),
              PermissionPicker(
                selected: _permissions,
                enabled: !_busy && !_confirming,
                onChanged: (permissions) =>
                    setState(() => _permissions = permissions),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(context.tr('employeeAccountActive')),
                value: _active,
                onChanged: _busy || _confirming
                    ? null
                    : (active) => setState(() => _active = active),
              ),
              if (_error != null) ErrorNotice(error: _error!),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy || _confirming
              ? null
              : () => Navigator.pop(context, false),
          child: Text(context.tr('back')),
        ),
        SubmitButton(
          busy: _busy,
          onPressed: _confirming ? null : _save,
          label: context.tr('saveEmployeeAccess'),
        ),
      ],
    ),
  );
}
