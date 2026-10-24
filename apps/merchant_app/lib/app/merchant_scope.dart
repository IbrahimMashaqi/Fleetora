import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/authentication/session.dart';
import '../core/networking/merchant_api.dart';
import '../core/networking/models.dart';

// A whole authenticated container is discarded on identity or session changes.
// No previously fetched merchant data is inherited by the next identity.
class MerchantScope extends StatefulWidget {
  const MerchantScope({
    super.key,
    required this.merchant,
    required this.api,
    required this.child,
  });
  final MerchantContext merchant;
  final MerchantApi api;
  final Widget child;
  @override
  State<MerchantScope> createState() => _MerchantScopeState();
}

class _MerchantScopeState extends State<MerchantScope> {
  late final ProviderContainer _container = ProviderContainer(
    overrides: [
      merchantProvider.overrideWithValue(widget.merchant),
      apiProvider.overrideWithValue(widget.api),
    ],
  );
  @override
  void didUpdateWidget(covariant MerchantScope oldWidget) {
    super.didUpdateWidget(oldWidget);
    _container.updateOverrides([
      merchantProvider.overrideWithValue(widget.merchant),
      apiProvider.overrideWithValue(widget.api),
    ]);
  }

  @override
  void dispose() {
    _container.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      UncontrolledProviderScope(container: _container, child: widget.child);
}
