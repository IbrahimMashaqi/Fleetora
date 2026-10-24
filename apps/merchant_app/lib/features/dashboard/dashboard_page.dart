import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/copy.dart';
import '../../core/authentication/session.dart';
import '../../core/networking/models.dart';
import '../../core/widgets/feedback.dart';

final recentParcelsProvider = FutureProvider.autoDispose<PageResult<Parcel>>(
  (ref) => ref.watch(apiProvider).parcels(),
);

class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final merchant = ref.watch(merchantProvider);
    return PageBody(
      children: [
        Text(
          merchant.merchant.name,
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        Text(
          merchant.company.name,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        Text(context.tr('dashboardHelp')),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final (permission, key, route, icon) in [
              (
                'PARCEL_CREATE',
                'newParcel',
                '/parcels/new',
                Icons.add_box_outlined,
              ),
              (
                'PICKUP_MANAGE',
                'newPickup',
                '/pickups/new',
                Icons.local_shipping_outlined,
              ),
              (
                'PARCEL_IMPORT',
                'imports',
                '/imports',
                Icons.upload_file_outlined,
              ),
              (
                'FINANCE_VIEW',
                'finances',
                '/accounting',
                Icons.account_balance_wallet_outlined,
              ),
            ])
              if (allowed(merchant, permission))
                OutlinedButton.icon(
                  onPressed: () => context.push(route),
                  icon: Icon(icon),
                  label: Text(context.tr(key)),
                ),
          ],
        ),
        if (allowed(merchant, 'PARCEL_VIEW')) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                context.tr('recentParcels'),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              TextButton(
                onPressed: () => context.go('/parcels'),
                child: Text(context.tr('viewAll')),
              ),
            ],
          ),
          AsyncPage(
            value: ref.watch(recentParcelsProvider),
            onRetry: () => ref.invalidate(recentParcelsProvider),
            builder: (page) => page.items.isEmpty
                ? const EmptyNotice()
                : Column(
                    children: [
                      for (final parcel in page.items.take(5))
                        Card(
                          child: ListTile(
                            onTap: () => context.push('/parcels/${parcel.id}'),
                            title: Text(parcel.recipientName),
                            subtitle: Text(
                              parcel.trackingNumber,
                              textDirection: TextDirection.ltr,
                            ),
                            trailing: StatusBadge(parcel.status),
                          ),
                        ),
                    ],
                  ),
          ),
        ],
      ],
    );
  }
}
