import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/localization/copy.dart';
import '../errors/api_failure.dart';

class PageBody extends StatelessWidget {
  const PageBody({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => SafeArea(
    child: Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 760),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            for (final child in children)
              Padding(padding: const EdgeInsets.only(bottom: 16), child: child),
          ],
        ),
      ),
    ),
  );
}

class AsyncPage<T> extends StatelessWidget {
  const AsyncPage({
    super.key,
    required this.value,
    required this.onRetry,
    required this.builder,
  });
  final AsyncValue<T> value;
  final VoidCallback onRetry;
  final Widget Function(T) builder;
  @override
  Widget build(BuildContext context) => value.when(
    skipLoadingOnRefresh: false,
    data: builder,
    loading: () => Center(
      child: Semantics(
        label: context.tr('loading'),
        child: const CircularProgressIndicator(),
      ),
    ),
    error: (error, stack) => Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ErrorNotice(error: error),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: Text(context.tr('retry'))),
          ],
        ),
      ),
    ),
  );
}

class ErrorNotice extends StatelessWidget {
  const ErrorNotice({super.key, required this.error});
  final Object error;
  @override
  Widget build(BuildContext context) {
    final key = error is ApiFailure
        ? 'error_${(error as ApiFailure).kind.name}'
        : 'error_invalidResponse';
    return Semantics(
      liveRegion: true,
      child: Text(
        context.tr(key),
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      ),
    );
  }
}

void showFailure(BuildContext context, Object error) =>
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: ErrorNotice(error: error)));
void showSuccess(BuildContext context) =>
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(context.tr('saved'))));
Future<bool> showConfirmation(
  BuildContext context, {
  required String title,
  required String message,
}) async =>
    await showDialog<bool>(
      context: context,
      useRootNavigator: false,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(ctx.tr('back')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(ctx.tr('confirm')),
          ),
        ],
      ),
    ) ??
    false;

class SubmitButton extends StatelessWidget {
  const SubmitButton({
    super.key,
    required this.busy,
    required this.onPressed,
    required this.label,
  });
  final bool busy;
  final VoidCallback? onPressed;
  final String label;
  @override
  Widget build(BuildContext context) => FilledButton(
    onPressed: busy ? null : onPressed,
    child: busy
        ? const SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : Text(label),
  );
}

class StatusBadge extends StatelessWidget {
  const StatusBadge(this.status, {super.key});
  final String status;
  @override
  Widget build(BuildContext context) => Chip(
    label: Text(context.tr('status_$status')),
    visualDensity: VisualDensity.compact,
  );
}

class EmptyNotice extends StatelessWidget {
  const EmptyNotice({super.key});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(32),
    child: Column(
      children: [
        const Icon(Icons.inventory_2_outlined, size: 40),
        const SizedBox(height: 12),
        Text(context.tr('empty')),
      ],
    ),
  );
}

class Pager extends StatelessWidget {
  const Pager({
    super.key,
    required this.page,
    required this.hasNext,
    required this.onPage,
  });
  final int page;
  final bool hasNext;
  final ValueChanged<int> onPage;
  @override
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      TextButton(
        onPressed: page > 1 ? () => onPage(page - 1) : null,
        child: Text(context.tr('previous')),
      ),
      Text('$page'),
      TextButton(
        onPressed: hasNext ? () => onPage(page + 1) : null,
        child: Text(context.tr('next')),
      ),
    ],
  );
}
