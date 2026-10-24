import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/copy.dart';
import '../../core/authentication/session.dart';
import '../../core/networking/models.dart';
import '../../core/widgets/feedback.dart';
import '../../core/formatting/value_format.dart';

final statementProvider = FutureProvider.autoDispose.family<Statement, int>((
  ref,
  page,
) {
  if (!allowed(ref.watch(merchantProvider), 'FINANCE_VIEW')) {
    throw StateError('Financial access required');
  }
  return ref.watch(apiProvider).statement(page: page);
});

class AccountingPage extends ConsumerStatefulWidget {
  const AccountingPage({super.key});
  @override
  ConsumerState<AccountingPage> createState() => _AccountingPageState();
}

class _AccountingPageState extends ConsumerState<AccountingPage> {
  int _page = 1;

  @override
  Widget build(BuildContext context) {
    final merchant = ref.watch(merchantProvider);
    if (!allowed(merchant, 'FINANCE_VIEW')) {
      return PageBody(children: [Text(context.tr('financeAccessRequired'))]);
    }
    final locale = Localizations.localeOf(context).toLanguageTag();
    return AsyncPage(
      value: ref.watch(statementProvider(_page)),
      onRetry: () => ref.invalidate(statementProvider(_page)),
      builder: (statement) => PageBody(
        children: [
          Text(
            context.tr('accounting'),
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          Text(
            context.tr('balances'),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          if (statement.balances.isEmpty) const EmptyNotice(),
          for (final balance in statement.balances)
            BalanceSummary(balance: balance),
          const Divider(),
          Text(
            context.tr('statementEntries'),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          if (statement.items.isEmpty) const EmptyNotice(),
          for (final item in statement.items)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      context.tr(
                        {
                              'GOODS',
                              'DELIVERY_FEE',
                              'RETURN_FEE',
                              'ADJUSTMENT',
                              'REVERSAL',
                            }.contains(item.kind)
                            ? 'ledger_${item.kind}'
                            : 'ledger_entry',
                      ),
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    Text(
                      exactMoney(item.amount, item.currency, locale),
                      textDirection: TextDirection.ltr,
                    ),
                    if (item.reason != null) Text(item.reason!),
                    if (item.shipmentId != null &&
                        allowed(merchant, 'PARCEL_VIEW'))
                      TextButton(
                        onPressed: () => context.go(
                          '/parcels/${Uri.encodeComponent(item.shipmentId!)}',
                        ),
                        child: Text(context.tr('relatedParcel')),
                      ),
                    Text(financialDate(item.createdAt, locale)),
                  ],
                ),
              ),
            ),
          Pager(
            page: statement.page,
            hasNext: statement.hasNext,
            onPage: (page) => setState(() => _page = page),
          ),
          OutlinedButton.icon(
            onPressed: () => ref.invalidate(statementProvider(_page)),
            icon: const Icon(Icons.refresh),
            label: Text(context.tr('refreshStatement')),
          ),
        ],
      ),
    );
  }
}

class BalanceSummary extends StatelessWidget {
  const BalanceSummary({super.key, required this.balance});
  final Balance balance;

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).toLanguageTag();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              balance.currency,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            for (final value in [
              (context.tr('balance'), balance.balance),
              (context.tr('eligibleBalance'), balance.eligible),
              (context.tr('paidBalance'), balance.paid),
            ])
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  spacing: 16,
                  children: [
                    Text(value.$1),
                    Text(
                      exactMoney(value.$2, balance.currency, locale),
                      textDirection: TextDirection.ltr,
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
