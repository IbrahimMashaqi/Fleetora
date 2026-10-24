import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../app/localization/copy.dart';
import '../../core/authentication/session.dart';
import '../../core/networking/models.dart';
import '../../core/widgets/feedback.dart';
import '../accounting/accounting_page.dart';
import '../../core/formatting/value_format.dart';

final settlementsProvider = FutureProvider.autoDispose
    .family<PageResult<SettlementRequest>, int>((ref, page) {
      if (!allowed(ref.watch(merchantProvider), 'FINANCE_VIEW')) {
        throw StateError('Financial access required');
      }
      return ref.watch(apiProvider).settlements(page: page);
    });

class SettlementDraft {
  const SettlementDraft({
    this.currency,
    this.notes = '',
    this.idempotencyKey,
    this.busy = false,
    this.submitted = false,
    this.error,
  });
  final String? currency;
  final String notes;
  final String? idempotencyKey;
  final bool busy;
  final bool submitted;
  final Object? error;
  bool get editable => idempotencyKey == null && !busy && !submitted;
}

// Kept in the authenticated scope so an uncertain write retains its identity
// when a user leaves this route and returns to retry it.
final settlementComposerProvider =
    NotifierProvider<SettlementComposer, SettlementDraft>(
      SettlementComposer.new,
    );

class SettlementComposer extends Notifier<SettlementDraft> {
  @override
  SettlementDraft build() => const SettlementDraft();

  void currency(String value) {
    if (state.editable) {
      state = SettlementDraft(currency: value, notes: state.notes);
    }
  }

  void notes(String value) {
    if (state.editable) {
      state = SettlementDraft(currency: state.currency, notes: value);
    }
  }

  void newRequest() {
    if (state.submitted) state = const SettlementDraft();
  }

  Future<void> submit() async {
    final actor = ref.read(merchantProvider);
    if (!allowed(actor, 'FINANCE_VIEW') ||
        !allowed(actor, 'SETTLEMENT_REQUEST') ||
        state.busy ||
        state.submitted ||
        state.currency == null) {
      return;
    }
    final currency = state.currency!;
    final notes = state.notes.trim();
    final key = state.idempotencyKey ?? const Uuid().v4();
    state = SettlementDraft(
      currency: currency,
      notes: state.notes,
      idempotencyKey: key,
      busy: true,
    );
    try {
      await ref
          .read(apiProvider)
          .requestSettlement(key, currency, notes.isEmpty ? null : notes);
      if (!ref.mounted) return;
      state = SettlementDraft(
        currency: currency,
        notes: notes,
        idempotencyKey: key,
        submitted: true,
      );
      ref.invalidate(settlementsProvider);
      ref.invalidate(statementProvider);
    } on Object catch (error) {
      if (!ref.mounted) return;
      state = SettlementDraft(
        currency: currency,
        notes: notes,
        idempotencyKey: key,
        error: error,
      );
    }
  }
}

class SettlementsPage extends ConsumerStatefulWidget {
  const SettlementsPage({super.key});
  @override
  ConsumerState<SettlementsPage> createState() => _SettlementsPageState();
}

class _SettlementsPageState extends ConsumerState<SettlementsPage> {
  int _page = 1;

  @override
  Widget build(BuildContext context) {
    final merchant = ref.watch(merchantProvider);
    if (!allowed(merchant, 'FINANCE_VIEW')) {
      return PageBody(children: [Text(context.tr('financeAccessRequired'))]);
    }
    final history = ref.watch(settlementsProvider(_page));
    final locale = Localizations.localeOf(context).toLanguageTag();
    return AsyncPage(
      value: history,
      onRetry: () => ref.invalidate(settlementsProvider(_page)),
      builder: (requests) => PageBody(
        children: [
          Text(
            context.tr('settlements'),
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          Text(context.tr('settlementExplanation')),
          if (allowed(merchant, 'SETTLEMENT_REQUEST'))
            const _SettlementRequestForm(),
          const Divider(),
          Text(
            context.tr('settlementHistory'),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          if (requests.items.isEmpty) const EmptyNotice(),
          for (final request in requests.items)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      request.currency,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: StatusBadge(request.status),
                    ),
                    if (request.notes != null) Text(request.notes!),
                    Text(financialDate(request.createdAt, locale)),
                  ],
                ),
              ),
            ),
          Pager(
            page: requests.page,
            hasNext: requests.hasNext,
            onPage: (page) => setState(() => _page = page),
          ),
          OutlinedButton.icon(
            onPressed: () => ref.invalidate(settlementsProvider(_page)),
            icon: const Icon(Icons.refresh),
            label: Text(context.tr('refreshSettlements')),
          ),
        ],
      ),
    );
  }
}

class _SettlementRequestForm extends ConsumerStatefulWidget {
  const _SettlementRequestForm();
  @override
  ConsumerState<_SettlementRequestForm> createState() =>
      _SettlementRequestFormState();
}

class _SettlementRequestFormState
    extends ConsumerState<_SettlementRequestForm> {
  bool _confirming = false;

  Future<void> _submit() async {
    if (_confirming || ref.read(settlementComposerProvider).busy) return;
    setState(() => _confirming = true);
    final confirmed = await showConfirmation(
      context,
      title: context.tr('requestSettlement'),
      message: context.tr('settlementConfirmation'),
    );
    if (!mounted) return;
    setState(() => _confirming = false);
    if (confirmed) await ref.read(settlementComposerProvider.notifier).submit();
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(settlementComposerProvider);
    final composer = ref.read(settlementComposerProvider.notifier);
    if (draft.submitted) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            context.tr('settlementRecorded'),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          Text(context.tr('settlementExplanation')),
          TextButton(
            onPressed: composer.newRequest,
            child: Text(context.tr('newSettlementRequest')),
          ),
        ],
      );
    }
    final balances = ref.watch(statementProvider(1));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          context.tr('requestSettlement'),
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 12),
        balances.when(
          data: (statement) {
            final currencies = statement.balances
                .map((balance) => balance.currency)
                .toSet();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (currencies.isEmpty)
                  Text(context.tr('noSettlementCurrency')),
                for (final balance in statement.balances)
                  BalanceSummary(balance: balance),
                if (draft.idempotencyKey != null)
                  Text('${context.tr('settlementCurrency')}: ${draft.currency}')
                else if (currencies.isNotEmpty)
                  DropdownButtonFormField<String>(
                    key: ValueKey(currencies.join('|')),
                    initialValue: currencies.contains(draft.currency)
                        ? draft.currency
                        : null,
                    decoration: InputDecoration(
                      labelText: context.tr('settlementCurrency'),
                    ),
                    items: [
                      for (final currency in currencies)
                        DropdownMenuItem(
                          value: currency,
                          child: Text(currency),
                        ),
                    ],
                    onChanged: draft.editable
                        ? (value) {
                            if (value != null) composer.currency(value);
                          }
                        : null,
                  ),
              ],
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stack) => Column(
            children: [
              ErrorNotice(error: error),
              TextButton(
                onPressed: () => ref.invalidate(statementProvider(1)),
                child: Text(context.tr('retry')),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        TextFormField(
          key: ValueKey(draft.idempotencyKey ?? 'settlement-notes'),
          initialValue: draft.notes,
          decoration: InputDecoration(labelText: context.tr('settlementNotes')),
          maxLength: 500,
          minLines: 2,
          maxLines: 4,
          enabled: draft.editable,
          onChanged: composer.notes,
        ),
        if (draft.error != null) ...[
          ErrorNotice(error: draft.error!),
          Text(context.tr('settlementRetryHelp')),
        ],
        const SizedBox(height: 12),
        SubmitButton(
          busy: draft.busy,
          onPressed:
              _confirming ||
                  draft.currency == null ||
                  (draft.editable &&
                      !(balances.asData?.value.balances.any(
                            (balance) => balance.currency == draft.currency,
                          ) ??
                          false))
              ? null
              : _submit,
          label: context.tr(
            draft.idempotencyKey == null
                ? 'sendSettlementRequest'
                : 'retrySettlementRequest',
          ),
        ),
      ],
    );
  }
}
