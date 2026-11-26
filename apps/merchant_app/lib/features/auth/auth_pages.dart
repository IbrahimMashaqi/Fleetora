import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/copy.dart';
import '../../app/localization/locale_state.dart';
import '../../core/authentication/session.dart';
import '../../core/networking/models.dart';
import '../../core/widgets/feedback.dart';
import 'activation_link.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});
  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController(), _password = TextEditingController();
  bool _busy = false, _obscured = true;
  Object? _error;
  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(sessionProvider.notifier)
          .signIn(_email.text, _password.text);
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: PageBody(
      children: [
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: TextButton(
            onPressed: ref.read(localeProvider.notifier).toggle,
            child: Text(context.tr('language')),
          ),
        ),
        const SizedBox(height: 28),
        const Icon(Icons.local_shipping_outlined, size: 56),
        Text(
          context.tr('appName'),
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        Text(context.tr('loginHelp')),
        Form(
          key: _form,
          child: AutofillGroup(
            child: Column(
              children: [
                TextFormField(
                  controller: _email,
                  enabled: !_busy,
                  textDirection: TextDirection.ltr,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.username],
                  decoration: InputDecoration(labelText: context.tr('email')),
                  validator: (value) =>
                      RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                          .hasMatch(value?.trim() ?? '')
                      ? null
                      : context.tr('invalidEmail'),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _password,
                  enabled: !_busy,
                  obscureText: _obscured,
                  textDirection: TextDirection.ltr,
                  autofillHints: const [AutofillHints.password],
                  decoration: InputDecoration(
                    labelText: context.tr('password'),
                    suffixIcon: IconButton(
                      tooltip: context.tr('password'),
                      onPressed: () => setState(() => _obscured = !_obscured),
                      icon: Icon(
                        _obscured
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                      ),
                    ),
                  ),
                  validator: (value) => (value?.isNotEmpty ?? false)
                      ? null
                      : context.tr('required'),
                  onFieldSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: 24),
                if (_error != null) ErrorNotice(error: _error!),
                SizedBox(
                  width: double.infinity,
                  child: SubmitButton(
                    busy: _busy,
                    onPressed: _submit,
                    label: context.tr('login'),
                  ),
                ),
              ],
            ),
          ),
        ),
        TextButton(
          onPressed: _busy ? null : () => context.go('/activate'),
          child: Text(context.tr('activate')),
        ),
      ],
    ),
  );
}

class ActivationPage extends ConsumerStatefulWidget {
  const ActivationPage({super.key, this.initialToken});
  final String? initialToken;
  @override
  ConsumerState<ActivationPage> createState() => _ActivationPageState();
}

class _ActivationPageState extends ConsumerState<ActivationPage> {
  final _form = GlobalKey<FormState>();
  final _token = TextEditingController(),
      _name = TextEditingController(),
      _password = TextEditingController();
  bool _busy = false, _done = false;
  Object? _error;
  // OD-13: the agreement shown for this invitation and the explicit acceptance of it.
  InvitationPreview? _preview;
  bool _agreed = false, _agreementMissing = false;
  @override
  void initState() {
    super.initState();
    _token.addListener(_forgetPreview);
    final token = widget.initialToken;
    if (token != null && validInvitationToken(token)) {
      _token.text = token;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final router = GoRouter.maybeOf(context);
        if (router != null) {
          Router.neglect(context, () => router.replace<void>('/activate'));
        }
      });
    }
  }

  void _forgetPreview() {
    if (_preview == null) return;
    setState(() {
      _preview = null;
      _agreed = false;
    });
  }

  @override
  void dispose() {
    _token.removeListener(_forgetPreview);
    _token.dispose();
    _name.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(apiProvider);
      final token = _token.text.trim();
      var preview = _preview;
      if (preview == null) {
        preview = await api.previewInvitation(token);
        if (!mounted) return;
        setState(() => _preview = preview);
        // The owner of a pending merchant reviews the agreement before activating.
        if (preview.requiresAgreement) return;
      }
      final agreement = preview.agreement;
      if (preview.requiresAgreement && !_agreed) {
        setState(() => _agreementMissing = true);
        return;
      }
      await api.activate(
        token,
        _name.text.trim(),
        _password.text,
        acceptedAgreementRevision: preview.requiresAgreement
            ? agreement?.merchantRevision
            : null,
      );
      _token.clear();
      _password.clear();
      if (mounted) setState(() => _done = true);
    } on Object catch (error) {
      if (mounted) {
        setState(() {
          _error = error;
          // Terms may have changed since they were shown: review them again.
          _preview = null;
          _agreed = false;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(context.tr('activate'))),
    body: PageBody(
      children: [
        Text(context.tr(_done ? 'activated' : 'activationHelp')),
        if (!_done)
          Form(
            key: _form,
            child: Column(
              children: [
                TextFormField(
                  controller: _token,
                  enabled: !_busy,
                  obscureText: true,
                  enableSuggestions: false,
                  autocorrect: false,
                  decoration: InputDecoration(
                    labelText: context.tr('activationToken'),
                  ),
                  validator: (value) =>
                      RegExp(r'^[A-Za-z0-9_-]{32,128}$')
                          .hasMatch(value?.trim() ?? '')
                      ? null
                      : context.tr('required'),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _name,
                  enabled: !_busy,
                  decoration: InputDecoration(labelText: context.tr('name')),
                  validator: (value) => (value?.trim().length ?? 0) >= 2
                      ? null
                      : context.tr('required'),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _password,
                  enabled: !_busy,
                  obscureText: true,
                  enableSuggestions: false,
                  autocorrect: false,
                  decoration: InputDecoration(
                    labelText: context.tr('password'),
                  ),
                  validator: (value) => (value?.length ?? 0) >= 8
                      ? null
                      : context.tr('invalidPassword'),
                ),
                if (_preview?.agreement case final agreement?) ...[
                  const SizedBox(height: 24),
                  _AgreementCard(
                    agreement: agreement,
                    accepted: _agreed,
                    missing: _agreementMissing,
                    enabled: !_busy,
                    onChanged: (value) => setState(() {
                      _agreed = value;
                      _agreementMissing = false;
                    }),
                  ),
                ],
                const SizedBox(height: 24),
                if (_error != null) ErrorNotice(error: _error!),
                SubmitButton(
                  busy: _busy,
                  onPressed: _submit,
                  label: context.tr(
                    _preview == null ? 'agreementReview' : 'activate',
                  ),
                ),
              ],
            ),
          ),
        TextButton(
          onPressed: _busy ? null : () => context.go('/login'),
          child: Text(context.tr('login')),
        ),
      ],
    ),
  );
}

/// OD-13 (BR-002, BR-093): the terms the owner accepts to activate the merchant.
class _AgreementCard extends StatelessWidget {
  const _AgreementCard({
    required this.agreement,
    required this.accepted,
    required this.missing,
    required this.enabled,
    required this.onChanged,
  });
  final AgreementTerms agreement;
  final bool accepted, missing, enabled;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    String money(String value) => '$value ${agreement.currency}';
    final rows = <(String, String)>[
      (context.tr('agreementCurrency'), agreement.currency),
      (
        context.tr('agreementPlan'),
        agreement.planName ?? context.tr('agreementNoPlan'),
      ),
      (context.tr('agreementDeliveryFee'), money(agreement.deliveryFee)),
      (context.tr('agreementReturnFee'), money(agreement.returnFee)),
      (context.tr('agreementServiceFee'), money(agreement.serviceFee)),
      (context.tr('agreementDiscount'), money(agreement.pricingDiscount)),
      (
        context.tr('agreementFeePayer'),
        context.tr('agreementPayer_${agreement.feePayer}'),
      ),
      (
        context.tr('agreementReturnPolicy'),
        context.tr('agreementReturn_${agreement.returnFeePolicy}'),
      ),
    ];
    return Card(
      key: const Key('merchant-agreement'),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.tr('agreementTitle'), style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(context.tr('agreementHelp')),
            const SizedBox(height: 12),
            for (final (label, value) in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Text(label)),
                    const SizedBox(width: 12),
                    Flexible(
                      child: Text(
                        value,
                        textAlign: TextAlign.end,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            CheckboxListTile(
              key: const Key('accept-agreement'),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: accepted,
              onChanged: enabled ? (value) => onChanged(value ?? false) : null,
              title: Text(context.tr('acceptAgreement')),
            ),
            if (missing)
              Text(
                context.tr('agreementRequired'),
                style: TextStyle(color: theme.colorScheme.error),
              ),
          ],
        ),
      ),
    );
  }
}
