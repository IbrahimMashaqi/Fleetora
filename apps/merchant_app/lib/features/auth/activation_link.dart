String? nativeActivationRoute(Uri uri) {
  if (uri.scheme != 'fleetora-merchant' ||
      uri.host != 'app' ||
      uri.path != '/activate' ||
      uri.userInfo.isNotEmpty ||
      uri.hasFragment ||
      uri.queryParametersAll.length != 1) {
    return null;
  }
  final values = uri.queryParametersAll['token'];
  if (values == null ||
      values.length != 1 ||
      !validInvitationToken(values.single)) {
    return null;
  }
  return Uri(
    path: '/activate',
    queryParameters: {'token': values.single},
  ).toString();
}

bool validInvitationToken(String value) =>
    RegExp(r'^[A-Za-z0-9_-]{32,128}$').hasMatch(value);
