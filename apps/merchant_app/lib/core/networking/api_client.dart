import 'package:dio/dio.dart';

import '../authentication/token_store.dart';
import '../config/app_config.dart';
import '../errors/api_failure.dart';
import 'models.dart';

Map<String, Object?> objectJson(Object? value) {
  if (value is Map<String, Object?>) return value;
  throw const ApiFailure(FailureKind.invalidResponse);
}

class ApiClient {
  ApiClient(AppConfig config, this._store, {Dio? dio})
    : _dio = dio ?? Dio(),
      _base = config.apiBaseUrl {
    _dio.options = BaseOptions(
      baseUrl: _base,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 25),
      sendTimeout: const Duration(seconds: 25),
      followRedirects: false,
      validateStatus: (status) => status != null,
    );
  }
  final Dio _dio;
  final String _base;
  final TokenStore _store;
  Tokens? _tokens;
  int _generation = 0;
  Future<void>? _refreshing;
  Future<void> _storageOperation = Future<void>.value();
  void Function()? onExpired;
  Future<void> Function()? onRefreshed;
  int get generation => _generation;

  Future<bool> restore() async {
    final generation = _generation;
    final tokens = await _store.read();
    if (generation != _generation) return false;
    _tokens = tokens;
    return tokens != null;
  }

  Future<void> signIn(String email, String password) async {
    final generation = ++_generation;
    final result = await request(
      '/auth/signin',
      method: 'POST',
      data: {'email': email.trim(), 'password': password},
      authenticated: false,
    );
    final tokens = _parseTokens(result);
    if (generation != _generation) {
      throw const ApiFailure(FailureKind.sessionChanged);
    }
    await _writeTokens(tokens, generation);
  }

  Tokens _parseTokens(Object? value) {
    try {
      return Tokens.fromJson(objectJson(value));
    } on Object {
      throw const ApiFailure(FailureKind.invalidResponse);
    }
  }

  Future<void> clear() async {
    _generation++;
    _tokens = null;
    onExpired?.call();
    await _serializeStore(_store.clear);
  }

  Future<void> logout() async {
    final generation = _generation;
    try {
      await request('/auth/logout', method: 'POST');
    } finally {
      if (generation == _generation) await clear();
    }
  }

  Future<void> _refresh() {
    final existing = _refreshing;
    if (existing != null) return existing;
    final generation = _generation;
    final token = _tokens?.refreshToken;
    final future = () async {
      if (token == null) throw const ApiFailure(FailureKind.unauthorized);
      final data = await request(
        '/auth/refresh',
        method: 'POST',
        authenticated: false,
        headers: {'Authorization': 'Bearer $token'},
      );
      if (_generation != generation) {
        throw const ApiFailure(FailureKind.sessionChanged);
      }
      final tokens = _parseTokens(data);
      await _writeTokens(tokens, generation);
      await onRefreshed?.call();
    }();
    _refreshing = future.whenComplete(() {
      _refreshing = null;
    });
    return _refreshing!;
  }

  Future<void> _serializeStore(Future<void> Function() operation) {
    final next = _storageOperation.then((_) => operation());
    _storageOperation = next.then<void>(
      (_) {},
      onError: (Object error, StackTrace stack) {},
    );
    return next;
  }

  Future<void> _writeTokens(Tokens tokens, int generation) =>
      _serializeStore(() async {
        if (generation != _generation) {
          throw const ApiFailure(FailureKind.sessionChanged);
        }
        await _store.write(tokens);
        if (generation != _generation) {
          await _store.clear();
          throw const ApiFailure(FailureKind.sessionChanged);
        }
        _tokens = tokens;
      });

  Future<Object?> request(
    String path, {
    String method = 'GET',
    Object? data,
    Map<String, Object?>? query,
    Map<String, String>? headers,
    bool authenticated = true,
    bool replayed = false,
  }) async {
    if (!path.startsWith('/') ||
        path.startsWith('//') ||
        path.contains('://')) {
      throw const ApiFailure(FailureKind.validation);
    }
    final generation = _generation;
    Response<Object?> response;
    try {
      response = await _dio.request<Object?>(
        path,
        data: data,
        queryParameters: query,
        options: Options(
          method: method,
          headers: {
            if (authenticated && _tokens != null)
              'Authorization': 'Bearer ${_tokens!.accessToken}',
            ...?headers,
          },
        ),
      );
    } on DioException {
      throw const ApiFailure(FailureKind.network);
    }
    if (authenticated && generation != _generation) {
      throw const ApiFailure(FailureKind.sessionChanged);
    }
    final status = response.statusCode ?? 502;
    if (status == 401 && authenticated) {
      if (method == 'GET' && !replayed && _tokens != null) {
        try {
          await _refresh();
        } on ApiFailure catch (failure) {
          if (failure.kind == FailureKind.unauthorized) await clear();
          rethrow;
        }
        return request(
          path,
          method: method,
          data: data,
          query: query,
          headers: headers,
          replayed: true,
        );
      }
      await clear();
    }
    if (status < 200 || status >= 300) {
      throw ApiFailure(switch (status) {
        400 || 413 || 422 => FailureKind.validation,
        401 => FailureKind.unauthorized,
        403 => FailureKind.forbidden,
        404 => FailureKind.notFound,
        409 => FailureKind.conflict,
        _ => FailureKind.server,
      }, status: status);
    }
    final envelope = objectJson(response.data);
    if (envelope['success'] != true || !envelope.containsKey('data')) {
      throw const ApiFailure(FailureKind.invalidResponse);
    }
    return envelope['data'];
  }

  void dispose() {
    _generation++;
    _tokens = null;
    _dio.close(force: true);
  }
}
