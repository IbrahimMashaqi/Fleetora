import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/copy.dart';
import '../../core/authentication/session.dart';
import '../../core/widgets/feedback.dart';

class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final merchant = ref.watch(merchantProvider);
    return PageBody(
      children: [
        Text(
          context.tr('profile'),
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        Text(
          merchant.merchant.name,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(context.tr('deliveryCompany')),
          subtitle: Text(merchant.company.name),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(context.tr('accountRole')),
          subtitle: Text(
            context.tr(merchant.owner ? 'merchantOwner' : 'merchantEmployee'),
          ),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(context.tr('contactPhone')),
          subtitle: Text(
            merchant.merchant.phone,
            textDirection: TextDirection.ltr,
          ),
        ),
        const Divider(),
        Text(
          context.tr('defaultPickupLocation'),
          style: Theme.of(context).textTheme.titleMedium,
        ),
        Text(merchant.merchant.pickupAddress),
        Text(merchant.merchant.city),
        Text(context.tr('alternatePickupHelp')),
        if (merchant.owner) ...[
          const Divider(),
          ListTile(
            title: Text(context.tr('merchantUsers')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/users'),
          ),
          ListTile(
            title: Text(context.tr('merchantActivity')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/activity'),
          ),
        ],
      ],
    );
  }
}
