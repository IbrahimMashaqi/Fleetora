import 'package:flutter/widgets.dart';

import 'generated/app_localizations.dart';

extension FleetoraCopy on BuildContext {
  String tr(String key) => AppLocalizations.of(this).text(key);
}
