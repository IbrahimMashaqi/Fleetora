import 'package:flutter/foundation.dart';

class AppConfig {
  AppConfig(String address, {bool release = kReleaseMode}) {
    final parsed = Uri.tryParse(address);
    if (parsed == null ||
        parsed.host.isEmpty ||
        parsed.userInfo.isNotEmpty ||
        parsed.hasQuery ||
        parsed.hasFragment ||
        (parsed.scheme != 'https' && !(parsed.scheme == 'http' && !release))) {
      throw const FormatException('Invalid API configuration');
    }
    apiBaseUrl = parsed.toString().replaceFirst(RegExp(r'/$'), '');
  }
  late final String apiBaseUrl;
  static const configuredUrl = String.fromEnvironment('API_BASE_URL');
  static const mapStyleUrl = String.fromEnvironment(
    'MAP_STYLE_URL',
    defaultValue: 'https://tiles.openfreemap.org/styles/liberty',
  );
}
