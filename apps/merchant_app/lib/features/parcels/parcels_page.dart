import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/localization/copy.dart';
import '../../core/authentication/session.dart';
import '../../core/widgets/feedback.dart';
import 'parcel_providers.dart';

const parcelStatuses = [
  'CREATED',
  'READY_FOR_DISPATCH',
  'RECEIVED_FROM_MERCHANT',
  'AT_WAREHOUSE',
  'ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'FAILED_DELIVERY',
  'RESCHEDULED',
  'RETURNED',
  'ON_HOLD',
  'RETURN_IN_PROGRESS',
  'RETURNED_TO_WAREHOUSE',
  'RETURNED_TO_MERCHANT',
];

class ParcelsPage extends ConsumerStatefulWidget {
  const ParcelsPage({super.key});
  @override
  ConsumerState<ParcelsPage> createState() => _ParcelsPageState();
}

class _ParcelsPageState extends ConsumerState<ParcelsPage> {
  final _searchController = TextEditingController();
  final _selected = <String>{};
  int _page = 1;
  String _search = '';
  String? _status;
  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _searchNow() => setState(() {
    _search = _searchController.text.trim();
    _page = 1;
    _selected.clear();
  });
  @override
  Widget build(BuildContext context) {
    final merchant = ref.watch(merchantProvider);
    final query = (page: _page, search: _search, status: _status);
    final data = ref.watch(parcelsProvider(query));
    return PageBody(
      children: [
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          spacing: 12,
          runSpacing: 12,
          children: [
            Text(
              context.tr('parcels'),
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            if (allowed(merchant, 'PARCEL_CREATE'))
              FilledButton.icon(
                onPressed: () => context.push('/parcels/new'),
                icon: const Icon(Icons.add),
                label: Text(context.tr('parcel_create')),
              ),
          ],
        ),
        TextField(
          controller: _searchController,
          maxLength: 100,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            labelText: context.tr('parcel_search'),
            suffixIcon: IconButton(
              tooltip: context.tr('parcel_search'),
              icon: const Icon(Icons.search),
              onPressed: _searchNow,
            ),
          ),
          onSubmitted: (_) => _searchNow(),
        ),
        DropdownButtonFormField<String>(
          initialValue: _status ?? '',
          isExpanded: true,
          decoration: InputDecoration(
            labelText: context.tr('parcel_filter_status'),
          ),
          items: [
            DropdownMenuItem(
              value: '',
              child: Text(context.tr('parcel_all_statuses')),
            ),
            for (final status in parcelStatuses)
              DropdownMenuItem(
                value: status,
                child: Text(context.tr('status_$status')),
              ),
          ],
          onChanged: (value) => setState(() {
            _status = value == '' ? null : value;
            _page = 1;
            _selected.clear();
          }),
        ),
        if (_selected.isNotEmpty)
          FilledButton.tonalIcon(
            onPressed: () => context.push(
              Uri(
                path: '/labels',
                queryParameters: {'ids': _selected.join(',')},
              ).toString(),
            ),
            icon: const Icon(Icons.print_outlined),
            label: Text('${context.tr('parcel_labels')} (${_selected.length})'),
          ),
        AsyncPage(
          value: data,
          onRetry: () => ref.invalidate(parcelsProvider(query)),
          builder: (result) => Column(
            children: [
              if (result.items.isEmpty) const EmptyNotice(),
              for (final parcel in result.items)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(8),
                    child: Row(
                      children: [
                        Checkbox(
                          value: _selected.contains(parcel.id),
                          semanticLabel:
                              '${context.tr('parcel_select')} ${parcel.trackingNumber}',
                          onChanged: (value) => setState(() {
                            if (value == true) {
                              _selected.add(parcel.id);
                            } else {
                              _selected.remove(parcel.id);
                            }
                          }),
                        ),
                        Expanded(
                          child: InkWell(
                            onTap: () => context.push('/parcels/${parcel.id}'),
                            child: Padding(
                              padding: const EdgeInsets.all(8),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Text(
                                    parcel.trackingNumber,
                                    textDirection: TextDirection.ltr,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleSmall,
                                  ),
                                  Text(parcel.recipientName),
                                  Text(
                                    '${parcel.city} · ${parcel.destination}',
                                  ),
                                  Wrap(
                                    spacing: 8,
                                    children: [
                                      StatusBadge(parcel.status),
                                      StatusBadge(parcel.custody),
                                    ],
                                  ),
                                  if (parcel.finalCustomerAmount != null)
                                    Text(
                                      '${parcel.finalCustomerAmount} ${parcel.currency}',
                                      textDirection: TextDirection.ltr,
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: context.tr('parcel_details'),
                          icon: const Icon(Icons.chevron_right),
                          onPressed: () =>
                              context.push('/parcels/${parcel.id}'),
                        ),
                      ],
                    ),
                  ),
                ),
              Pager(
                page: result.page,
                hasNext: result.hasNext,
                onPage: (page) => setState(() {
                  _page = page;
                  _selected.clear();
                }),
              ),
            ],
          ),
        ),
        OutlinedButton.icon(
          onPressed: () => ref.invalidate(parcelsProvider(query)),
          icon: const Icon(Icons.refresh),
          label: Text(context.tr('refresh')),
        ),
      ],
    );
  }
}
