import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../networking/models.dart';

abstract interface class TokenStore {
  Future<Tokens?> read();
  Future<void> write(Tokens tokens);
  Future<void> clear();
}

class DeviceTokenStore implements TokenStore {
  DeviceTokenStore(String apiOrigin)
    : _key = 'fleetora_${sha256.convert(utf8.encode(apiOrigin))}';
  final String _key;
  final FlutterSecureStorage _storage = const FlutterSecureStorage(
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.unlocked_this_device,
    ),
  );
  Tokens? _webTokens;
  @override
  Future<Tokens?> read() async {
    if (kIsWeb) return _webTokens;
    final value = await _storage.read(key: _key);
    if (value == null) return null;
    try {
      final decoded = jsonDecode(value);
      if (decoded is! Map<String, Object?>) throw const FormatException();
      return Tokens.fromJson(decoded);
    } on Object {
      await clear();
      return null;
    }
  }

  @override
  Future<void> write(Tokens tokens) async {
    if (kIsWeb) {
      _webTokens = tokens;
      return;
    }
    await _storage.write(
      key: _key,
      value: jsonEncode({
        'accessToken': tokens.accessToken,
        'refreshToken': tokens.refreshToken,
      }),
    );
  }

  @override
  Future<void> clear() async {
    _webTokens = null;
    if (!kIsWeb) await _storage.delete(key: _key);
  }
}
