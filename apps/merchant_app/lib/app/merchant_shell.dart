import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'localization/copy.dart';
import '../core/authentication/session.dart';
import '../core/networking/models.dart';
import '../core/widgets/feedback.dart';

class MerchantShell extends StatelessWidget {
  const MerchantShell({
    super.key,
    required this.child,
    required this.merchant,
    required this.onLogout,
    required this.onLocale,
  });
  final Widget child;
  final MerchantContext merchant;
  final Future<void> Function() onLogout;
  final VoidCallback onLocale;
  @override
  Widget build(BuildContext context) {
    final path = GoRouterState.of(context).uri.path;
    final entries = [
      ('home', '/', Icons.space_dashboard_outlined),
      if (allowed(merchant, 'PARCEL_VIEW'))
        ('parcels', '/parcels', Icons.inventory_2_outlined),
      if (allowed(merchant, 'PICKUP_MANAGE'))
        ('pickups', '/pickups', Icons.local_shipping_outlined),
      ('account', '/profile', Icons.person_outline),
    ];
    final selected = path == '/'
        ? 0
        : entries.indexWhere(
            (entry) => entry.$2 != '/' && path.startsWith(entry.$2),
          );
    return Scaffold(
      appBar: AppBar(
        title: Text(context.tr(entries[selected < 0 ? 0 : selected].$1)),
        actions: [
          IconButton(
            tooltip: context.tr('language'),
            onPressed: () {
              ScaffoldMessenger.of(context).clearSnackBars();
              onLocale();
            },
            icon: const Icon(Icons.translate),
          ),
          IconButton(
            tooltip: context.tr('logout'),
            onPressed: () async {
              if (await showConfirmation(
                context,
                title: context.tr('logout'),
                message: context.tr('logoutWarning'),
              )) {
                try {
                  await onLogout();
                } on Object catch (error) {
                  if (context.mounted) showFailure(context, error);
                }
              }
            },
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: child,
      drawer: NavigationDrawer(
        children: [
          Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              merchant.merchant.name,
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          for (final (key, route, icon) in [
            ...entries,
            if (allowed(merchant, 'PARCEL_CREATE'))
              ('newParcel', '/parcels/new', Icons.add_box_outlined),
            if (allowed(merchant, 'PARCEL_IMPORT'))
              ('imports', '/imports', Icons.upload_file_outlined),
            if (allowed(merchant, 'FINANCE_VIEW'))
              (
                'finances',
                '/accounting',
                Icons.account_balance_wallet_outlined,
              ),
            if (allowed(merchant, 'FINANCE_VIEW'))
              ('settlements', '/settlements', Icons.payments_outlined),
            if (merchant.owner) ('employees', '/users', Icons.group_outlined),
            if (merchant.owner) ('activity', '/activity', Icons.history),
          ])
            ListTile(
              leading: Icon(icon),
              title: Text(context.tr(key)),
              onTap: () {
                Navigator.pop(context);
                context.go(route);
              },
            ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selected < 0 ? 0 : selected,
        onDestinationSelected: (index) => context.go(entries[index].$2),
        destinations: [
          for (final (key, _, icon) in entries)
            NavigationDestination(icon: Icon(icon), label: context.tr(key)),
        ],
      ),
    );
  }
}
