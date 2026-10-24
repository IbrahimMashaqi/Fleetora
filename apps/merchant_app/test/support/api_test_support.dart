import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:fleetora_merchant/core/authentication/token_store.dart';
import 'package:fleetora_merchant/core/networking/models.dart';

class MemoryTokens implements TokenStore {
  Tokens? value;
  @override
  Future<Tokens?> read() async => value;
  @override
  Future<void> write(Tokens tokens) async {
    value = tokens;
  }

  @override
  Future<void> clear() async {
    value = null;
  }
}

class Adapter implements HttpClientAdapter {
  Adapter(this.handle);
  final Future<ResponseBody> Function(RequestOptions) handle;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancelFuture,
  ) => handle(options);
  @override
  void close({bool force = false}) {}
}

ResponseBody reply(Object? data, {int status = 200}) => ResponseBody.fromString(
  jsonEncode({'success': true, 'data': data}),
  status,
  headers: {
    'content-type': ['application/json'],
  },
);
