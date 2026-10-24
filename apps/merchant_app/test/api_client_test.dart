import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fleetora_merchant/core/config/app_config.dart';
import 'package:fleetora_merchant/core/errors/api_failure.dart';
import 'package:fleetora_merchant/core/networking/api_client.dart';
import 'package:fleetora_merchant/core/networking/models.dart';

import 'support/api_test_support.dart';

class DelayedTokens extends MemoryTokens {
  final entered = Completer<void>();
  final release = Completer<void>();
  bool first = true;
  @override
  Future<void> write(Tokens tokens) async {
    if (first) {
      first = false;
      entered.complete();
      await release.future;
    }
    await super.write(tokens);
  }
}

void main() {
  test('restored sessions attach their stored access token', () async {
    final store = MemoryTokens()
      ..value = const Tokens(
        accessToken: 'stored-access',
        refreshToken: 'stored-refresh',
      );
    final dio = Dio()
      ..httpClientAdapter = Adapter((request) async {
        expect(request.headers['Authorization'], 'Bearer stored-access');
        return reply({'items': <Object?>[]});
      });
    final client = ApiClient(
      AppConfig('https://fixture.example.invalid'),
      store,
      dio: dio,
    );
    addTearDown(client.dispose);
    expect(await client.restore(), isTrue);
    expect(await client.request('/merchant/parcels'), {'items': <Object?>[]});
  });

  test(
    'denied refresh expires the session and clears persisted tokens',
    () async {
      var expired = 0;
      final paths = <String>[];
      final store = MemoryTokens()
        ..value = const Tokens(accessToken: 'old', refreshToken: 'refresh');
      final dio = Dio()
        ..httpClientAdapter = Adapter((request) async {
          paths.add(request.path);
          return reply(null, status: 401);
        });
      final client = ApiClient(
        AppConfig('https://fixture.example.invalid'),
        store,
        dio: dio,
      )..onExpired = () => expired++;
      addTearDown(client.dispose);
      await client.restore();
      await expectLater(
        client.request('/merchant/me'),
        throwsA(
          isA<ApiFailure>().having(
            (e) => e.kind,
            'kind',
            FailureKind.unauthorized,
          ),
        ),
      );
      expect(paths, ['/merchant/me', '/auth/refresh']);
      expect(store.value, isNull);
      expect(expired, 1);
      expect(await client.restore(), isFalse);
    },
  );

  test(
    'transient refresh failure retains the session without replaying the read',
    () async {
      var expired = 0;
      final paths = <String>[];
      final store = MemoryTokens()
        ..value = const Tokens(accessToken: 'old', refreshToken: 'refresh');
      final dio = Dio()
        ..httpClientAdapter = Adapter((request) async {
          paths.add(request.path);
          if (request.path == '/auth/refresh') {
            throw DioException(
              requestOptions: request,
              type: DioExceptionType.connectionError,
            );
          }
          return reply(null, status: 401);
        });
      final client = ApiClient(
        AppConfig('https://fixture.example.invalid'),
        store,
        dio: dio,
      )..onExpired = () => expired++;
      addTearDown(client.dispose);
      await client.restore();
      await expectLater(
        client.request('/merchant/me'),
        throwsA(
          isA<ApiFailure>().having((e) => e.kind, 'kind', FailureKind.network),
        ),
      );
      expect(paths, ['/merchant/me', '/auth/refresh']);
      expect(store.value!.accessToken, 'old');
      expect(store.value!.refreshToken, 'refresh');
      expect(expired, 0);
    },
  );

  test(
    'logout clears persisted credentials even when the server is unreachable',
    () async {
      final store = MemoryTokens()
        ..value = const Tokens(accessToken: 'old', refreshToken: 'refresh');
      final dio = Dio()
        ..httpClientAdapter = Adapter((request) async {
          expect(request.path, '/auth/logout');
          expect(request.method, 'POST');
          throw DioException(
            requestOptions: request,
            type: DioExceptionType.connectionError,
          );
        });
      final client = ApiClient(
        AppConfig('https://fixture.example.invalid'),
        store,
        dio: dio,
      );
      addTearDown(client.dispose);
      await client.restore();
      await expectLater(client.logout(), throwsA(isA<ApiFailure>()));
      expect(store.value, isNull);
      expect(await client.restore(), isFalse);
    },
  );

  test('placeholder success and invalid envelopes are rejected', () async {
    for (final body in [
      '{}',
      '{"success":true}',
      '{"success":false,"data":{}}',
      '[]',
    ]) {
      final dio = Dio()
        ..httpClientAdapter = Adapter(
          (_) async => ResponseBody.fromString(
            body,
            200,
            headers: {
              'content-type': ['application/json'],
            },
          ),
        );
      final client = ApiClient(
        AppConfig('https://fixture.example.invalid'),
        MemoryTokens(),
        dio: dio,
      );
      await expectLater(
        client.request('/merchant/me'),
        throwsA(
          isA<ApiFailure>().having(
            (e) => e.kind,
            'kind',
            FailureKind.invalidResponse,
          ),
        ),
      );
      client.dispose();
    }
  });

  test(
    'a delayed old secure-storage write cannot erase a later sign-in',
    () async {
      final store = DelayedTokens();
      var attempts = 0;
      final dio = Dio()
        ..httpClientAdapter = Adapter(
          (request) async => reply({
            'accessToken': 'access-${++attempts}',
            'refreshToken': 'fixture-refresh',
          }),
        );
      final client = ApiClient(
        AppConfig('https://fixture.example'),
        store,
        dio: dio,
      );
      final old = client.signIn('old@example.invalid', 'fixture-password');
      final oldRejected = expectLater(
        old,
        throwsA(
          isA<ApiFailure>().having(
            (error) => error.kind,
            'kind',
            FailureKind.sessionChanged,
          ),
        ),
      );
      await store.entered.future;
      final clear = client.clear();
      final next = client.signIn('new@example.invalid', 'fixture-password');
      store.release.complete();
      await oldRejected;
      await clear;
      await next;
      expect(store.value!.accessToken, 'access-2');
      client.dispose();
    },
  );
  test('release requires HTTPS and URL rejects credentials/query/fragment', () {
    for (final url in [
      'http://api.example.com',
      'https://a:b@api.example.com',
      'https://api.example.com?token=x',
      'https://api.example.com#x',
    ]) {
      expect(() => AppConfig(url, release: true), throwsFormatException);
    }
    expect(
      AppConfig('http://127.0.0.1:3001', release: false).apiBaseUrl,
      'http://127.0.0.1:3001',
    );
  });
  test('tokens and numeric money response are strictly parsed', () {
    expect(
      () => Tokens.fromJson({'accessToken': 42, 'refreshToken': 'x'}),
      throwsA(isA<Object>()),
    );
    expect(
      () => PricingPreview.fromJson({'finalCustomerAmount': 150}),
      throwsA(isA<Object>()),
    );
  });
  test('single flight refresh and safe GET replay', () async {
    var refreshes = 0;
    var reads = 0;
    final store = MemoryTokens()
      ..value = const Tokens(accessToken: 'old', refreshToken: 'refresh');
    final dio = Dio()
      ..httpClientAdapter = Adapter((request) async {
        if (request.path == '/auth/refresh') {
          refreshes++;
          await Future<void>.delayed(const Duration(milliseconds: 10));
          expect(request.headers['Authorization'], 'Bearer refresh');
          return reply({'accessToken': 'new', 'refreshToken': 'next'});
        }
        reads++;
        return request.headers['Authorization'] == 'Bearer old'
            ? reply(null, status: 401)
            : reply({'ok': true});
      });
    final client = ApiClient(
      AppConfig('https://api.example.com'),
      store,
      dio: dio,
    );
    expect(await client.restore(), true);
    final results = await Future.wait([
      client.request('/merchant/me'),
      client.request('/merchant/me'),
    ]);
    expect(results, [
      {'ok': true},
      {'ok': true},
    ]);
    expect(refreshes, 1);
    expect(reads, 4);
    expect(store.value!.accessToken, 'new');
    expect(store.value!.refreshToken, 'next');
    client.dispose();
  });
  test('POST is never replayed on 401 and credentials cleared', () async {
    var attempts = 0;
    final store = MemoryTokens()
      ..value = const Tokens(accessToken: 'old', refreshToken: 'r');
    final dio = Dio()
      ..httpClientAdapter = Adapter((_) async {
        attempts++;
        return reply(null, status: 401);
      });
    final client = ApiClient(
      AppConfig('https://api.example.com'),
      store,
      dio: dio,
    );
    await client.restore();
    await expectLater(
      client.request(
        '/merchant/parcels',
        method: 'POST',
        data: {'idempotencyKey': 'same'},
      ),
      throwsA(
        isA<ApiFailure>().having(
          (e) => e.kind,
          'kind',
          FailureKind.unauthorized,
        ),
      ),
    );
    expect(attempts, 1);
    expect(store.value, isNull);
    client.dispose();
  });
  test('uncertain write timeout is not retried', () async {
    var calls = 0;
    final dio = Dio()
      ..httpClientAdapter = Adapter((request) async {
        calls++;
        throw DioException(
          requestOptions: request,
          type: DioExceptionType.receiveTimeout,
        );
      });
    final client = ApiClient(
      AppConfig('https://api.example.com'),
      MemoryTokens(),
      dio: dio,
    );
    await expectLater(
      client.request('/merchant/parcels', method: 'POST'),
      throwsA(
        isA<ApiFailure>().having((e) => e.kind, 'kind', FailureKind.network),
      ),
    );
    expect(calls, 1);
    client.dispose();
  });
  test('response from prior session is discarded', () async {
    final dio = Dio()
      ..httpClientAdapter = Adapter((request) async {
        await Future<void>.delayed(const Duration(milliseconds: 30));
        return reply({'private': 'old'});
      });
    final client = ApiClient(
      AppConfig('https://api.example.com'),
      MemoryTokens(),
      dio: dio,
    );
    final pending = client.request('/merchant/statement');
    final assertion = expectLater(
      pending,
      throwsA(
        isA<ApiFailure>().having(
          (e) => e.kind,
          'kind',
          FailureKind.sessionChanged,
        ),
      ),
    );
    await client.clear();
    await assertion;
    client.dispose();
  });
  test(
    'status errors are safe and raw backend errors are not displayed',
    () async {
      final dio = Dio()
        ..httpClientAdapter = Adapter(
          (_) async => ResponseBody.fromString(
            '{"message":"secret password connection"}',
            403,
            headers: {
              'content-type': ['application/json'],
            },
          ),
        );
      final client = ApiClient(
        AppConfig('https://api.example.com'),
        MemoryTokens(),
        dio: dio,
      );
      await expectLater(
        client.request('/merchant/statement'),
        throwsA(
          isA<ApiFailure>()
              .having((e) => e.kind, 'kind', FailureKind.forbidden)
              .having((e) => e.toString().contains('secret'), 'leak', false),
        ),
      );
      client.dispose();
    },
  );
  test('request rejects external URLs and protocol-relative paths', () async {
    final client = ApiClient(
      AppConfig('https://api.example.com'),
      MemoryTokens(),
    );
    await expectLater(
      client.request('//attacker.example'),
      throwsA(isA<ApiFailure>()),
    );
    await expectLater(
      client.request('https://attacker.example'),
      throwsA(isA<ApiFailure>()),
    );
    client.dispose();
  });
}
