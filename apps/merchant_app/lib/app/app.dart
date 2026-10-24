import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/authentication/session.dart';
import '../core/config/app_config.dart';
import '../core/networking/models.dart';
import '../core/widgets/feedback.dart';
import '../features/auth/auth_pages.dart';
import '../features/auth/activation_link.dart';
import '../features/dashboard/dashboard_page.dart';
import '../features/parcels/parcels_page.dart';
import '../features/parcels/parcel_form_page.dart';
import '../features/parcels/parcel_details_page.dart';
import '../features/labels/labels_page.dart';
import '../features/pickups/pickups_page.dart';
import '../features/pickups/pickup_form_page.dart';
import '../features/pickups/pickup_details_page.dart';
import '../features/bulk_import/import_page.dart';
import '../features/profile/profile_page.dart';
import '../features/merchant_users/merchant_users_page.dart';
import '../features/merchant_users/activity_page.dart';
import '../features/accounting/accounting_page.dart';
import '../features/settlements/settlements_page.dart';
import 'localization/copy.dart';
import 'localization/locale_state.dart';
import 'localization/generated/app_localizations.dart';
import 'merchant_scope.dart';
import 'merchant_shell.dart';
import 'theme/app_theme.dart';

String? routePermission(String path) {
  if (path == '/parcels/new') return 'PARCEL_CREATE';
  if (path.endsWith('/edit') || path.endsWith('/amend')) return 'PARCEL_EDIT';
  if (path.startsWith('/parcels') || path.startsWith('/labels')) {
    return 'PARCEL_VIEW';
  }
  if (path.startsWith('/pickups')) return 'PICKUP_MANAGE';
  if (path.startsWith('/imports')) return 'PARCEL_IMPORT';
  if (path == '/accounting' || path == '/settlements') return 'FINANCE_VIEW';
  return null;
}

bool routeAllowed(MerchantContext merchant, String path) {
  if ((path == '/users' || path == '/activity') && !merchant.owner) {
    return false;
  }
  final permission = routePermission(path);
  return permission == null || allowed(merchant, permission);
}

final routerProvider = Provider<GoRouter>((ref) {
  final changes = ValueNotifier<int>(0);
  ref.listen(sessionProvider, (_, next) {
    changes.value++;
  });
  final router = GoRouter(
    initialLocation: '/',
    refreshListenable: changes,
    redirect: (context, state) {
      final activation = nativeActivationRoute(state.uri);
      if (activation != null) return activation;
      final session = ref.read(sessionProvider);
      final merchant = session.asData?.value;
      final path = state.uri.path;
      // Public invitation handoff must survive asynchronous credential restore.
      if (path == '/activate' && merchant == null) return null;
      if (session.isLoading || session.hasError) {
        return path == '/session' ? null : '/session';
      }
      if (merchant == null) {
        return path == '/login' || path == '/activate' ? null : '/login';
      }
      if (path == '/login' || path == '/activate' || path == '/session') {
        return '/';
      }
      if (!routeAllowed(merchant, path)) return '/forbidden';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginPage()),
      GoRoute(
        path: '/activate',
        builder: (context, state) =>
            ActivationPage(initialToken: state.uri.queryParameters['token']),
      ),
      GoRoute(
        path: '/session',
        builder: (context, state) => Consumer(
          builder: (context, ref, child) => Scaffold(
            body: AsyncPage(
              value: ref.watch(sessionProvider),
              onRetry: () => ref.invalidate(sessionProvider),
              builder: (_) => const SizedBox.shrink(),
            ),
          ),
        ),
      ),
      ShellRoute(
        builder: (context, state, child) => Consumer(
          builder: (context, ref, _) {
            final merchant = ref.watch(sessionProvider).asData?.value;
            if (merchant == null) return const SizedBox.shrink();
            return MerchantScope(
              key: ValueKey(
                '${merchant.userId}:${merchant.companyId}:${merchant.merchantId}:${merchant.membershipId}:${merchant.owner}:${(merchant.permissions.toList()..sort()).join(',')}:${ref.read(clientProvider).generation}',
              ),
              merchant: merchant,
              api: ref.read(apiProvider),
              child: MerchantShell(
                merchant: merchant,
                onLogout: ref.read(sessionProvider.notifier).logout,
                onLocale: ref.read(localeProvider.notifier).toggle,
                child: child,
              ),
            );
          },
        ),
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => const DashboardPage(),
          ),
          GoRoute(
            path: '/parcels',
            builder: (context, state) => const ParcelsPage(),
          ),
          GoRoute(
            path: '/parcels/new',
            builder: (context, state) => const ParcelFormPage(),
          ),
          GoRoute(
            path: '/parcels/:id/edit',
            builder: (context, state) =>
                ParcelFormPage(parcelId: state.pathParameters['id']!),
          ),
          GoRoute(
            path: '/parcels/:id/amend',
            builder: (context, state) => ParcelFormPage(
              parcelId: state.pathParameters['id']!,
              amendment: true,
            ),
          ),
          GoRoute(
            path: '/parcels/:id',
            builder: (context, state) =>
                ParcelDetailsPage(id: state.pathParameters['id']!),
          ),
          GoRoute(
            path: '/labels',
            builder: (context, state) => LabelsPage(
              ids: (state.uri.queryParameters['ids'] ?? '')
                  .split(',')
                  .where((id) => id.isNotEmpty)
                  .toList(growable: false),
            ),
          ),
          GoRoute(
            path: '/pickups',
            builder: (context, state) => const PickupsPage(),
          ),
          GoRoute(
            path: '/pickups/new',
            builder: (context, state) => const PickupFormPage(),
          ),
          GoRoute(
            path: '/pickups/:id',
            builder: (context, state) =>
                PickupDetailsPage(id: state.pathParameters['id']!),
          ),
          GoRoute(
            path: '/imports',
            builder: (context, state) => const ImportPage(),
          ),
          GoRoute(
            path: '/profile',
            builder: (context, state) => const ProfilePage(),
          ),
          GoRoute(
            path: '/users',
            builder: (context, state) => const MerchantUsersPage(),
          ),
          GoRoute(
            path: '/activity',
            builder: (context, state) => const ActivityPage(),
          ),
          GoRoute(
            path: '/accounting',
            builder: (context, state) => const AccountingPage(),
          ),
          GoRoute(
            path: '/settlements',
            builder: (context, state) => const SettlementsPage(),
          ),
          GoRoute(
            path: '/forbidden',
            builder: (context, state) =>
                Center(child: Text(context.tr('permissionDenied'))),
          ),
        ],
      ),
    ],
    errorBuilder: (context, state) =>
        Scaffold(body: Center(child: Text(context.tr('error_notFound')))),
  );
  ref.onDispose(() {
    router.dispose();
    changes.dispose();
  });
  return router;
});

class FleetoraMerchantApp extends ConsumerStatefulWidget {
  const FleetoraMerchantApp({super.key});
  @override
  ConsumerState<FleetoraMerchantApp> createState() =>
      _FleetoraMerchantAppState();
}

class _FleetoraMerchantAppState extends ConsumerState<FleetoraMerchantApp>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        AppConfig.configuredUrl.isNotEmpty) {
      unawaited(ref.read(sessionProvider.notifier).refreshIdentity());
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = ref.watch(localeProvider);
    if (AppConfig.configuredUrl.isEmpty) {
      return MaterialApp(
        theme: FleetoraTheme.light(),
        locale: locale,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(context.tr('configuration')),
              ),
            ),
          ),
        ),
      );
    }
    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      theme: FleetoraTheme.light(),
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: ref.watch(routerProvider),
    );
  }
}
