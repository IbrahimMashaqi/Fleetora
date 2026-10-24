import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/copy.dart';
import '../../app/localization/locale_state.dart';
import '../../core/authentication/session.dart';
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
  @override
  void initState() {
    super.initState();
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

  @override
  void dispose() {
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
      await ref
          .read(apiProvider)
          .activate(_token.text.trim(), _name.text.trim(), _password.text);
      _token.clear();
      _password.clear();
      if (mounted) setState(() => _done = true);
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
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
                const SizedBox(height: 24),
                if (_error != null) ErrorNotice(error: _error!),
                SubmitButton(
                  busy: _busy,
                  onPressed: _submit,
                  label: context.tr('activate'),
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
