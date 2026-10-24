import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../app/localization/copy.dart';
import '../../core/authentication/session.dart';
import '../../core/widgets/feedback.dart';
import 'pickup_repository.dart';

String pickupTime(BuildContext context, String? value) {
  if (value == null) return context.tr('pickup_notScheduled');
  final date = DateTime.tryParse(value);
  if (date == null) return context.tr('pickup_notScheduled');
  return DateFormat.yMMMd(Localizations.localeOf(context).languageCode)
      .add_jm()
      .format(date.toLocal());
}

class PickupsPage extends ConsumerStatefulWidget {
  const PickupsPage({super.key});
  @override
  ConsumerState<PickupsPage> createState() => _PickupsPageState();
}

class _PickupsPageState extends ConsumerState<PickupsPage> {
  int _page = 1;
  @override
  Widget build(BuildContext context) {
    if (!allowed(ref.watch(merchantProvider), 'PICKUP_MANAGE')) {
      return PageBody(children: [Text(context.tr('pickup_denied'))]);
    }
    return AsyncPage(
      value: ref.watch(pickupsProvider(_page)),
      onRetry: () => ref.invalidate(pickupsProvider(_page)),
      builder: (result) => PageBody(
        children: [
          Text(
            context.tr('pickup_title'),
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          FilledButton.icon(
            onPressed: () => context.push('/pickups/new'),
            icon: const Icon(Icons.add),
            label: Text(context.tr('pickup_new')),
          ),
          Text(context.tr('pickup_receiptNotice')),
          if (result.items.isEmpty) const EmptyNotice(),
          for (final pickup in result.items)
            Card(
              child: ListTile(
                title: Text(context.tr('pickup_method_${pickup.method}')),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(pickup.pickupAddress),
                    StatusBadge(pickup.status),
                    Text(
                      '${context.tr('pickup_preferred')}: ${pickupTime(context, pickup.preferredFrom)}',
                    ),
                  ],
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () =>
                    context.push('/pickups/${Uri.encodeComponent(pickup.id)}'),
              ),
            ),
          Pager(
            page: result.page,
            hasNext: result.hasNext,
            onPage: (page) => setState(() => _page = page),
          ),
        ],
      ),
    );
  }
}
