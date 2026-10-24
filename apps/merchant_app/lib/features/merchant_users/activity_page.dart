import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/copy.dart';
import '../../core/authentication/session.dart';
import '../../core/networking/models.dart';
import '../../core/widgets/feedback.dart';
import '../../core/formatting/value_format.dart';

final merchantActivityProvider = FutureProvider.autoDispose<List<Activity>>((
  ref,
) {
  if (!ref.watch(merchantProvider).owner) {
    throw StateError('Owner access required');
  }
  return ref.watch(apiProvider).activity();
});

const _knownActivityActions = {
  'INVITATION_ISSUED',
  'INVITATION_ACCEPTED',
  'INVITATION_REVOKED',
  'EMPLOYEE_UPDATED',
  'SETTLEMENT_REQUESTED',
  'SETTLEMENT_REQUEST_REVIEWED',
  'PICKUP_ACCEPT_PROPOSAL',
  'PICKUP_CANCEL',
  'PICKUP_CONFIRM',
  'PICKUP_PROPOSE',
  'PICKUP_RECEIPT_RECORDED',
};

class ActivityPage extends ConsumerWidget {
  const ActivityPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(merchantProvider).owner) {
      return PageBody(children: [Text(context.tr('ownerAccessRequired'))]);
    }
    final locale = Localizations.localeOf(context).toLanguageTag();
    return AsyncPage(
      value: ref.watch(merchantActivityProvider),
      onRetry: () => ref.invalidate(merchantActivityProvider),
      builder: (activity) => PageBody(
        children: [
          Text(
            context.tr('merchantActivity'),
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          Text(context.tr('merchantActivityHelp')),
          if (activity.isEmpty) const EmptyNotice(),
          for (final event in activity)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      context.tr(
                        _knownActivityActions.contains(event.action)
                            ? 'activity_${event.action}'
                            : 'activity_recorded',
                      ),
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    Text(
                      '${context.tr('activityActor')}: ${event.actorId}',
                      textDirection: TextDirection.ltr,
                    ),
                    Text(financialDate(event.createdAt, locale)),
                  ],
                ),
              ),
            ),
          OutlinedButton.icon(
            onPressed: () => ref.invalidate(merchantActivityProvider),
            icon: const Icon(Icons.refresh),
            label: Text(context.tr('refreshActivity')),
          ),
        ],
      ),
    );
  }
}
