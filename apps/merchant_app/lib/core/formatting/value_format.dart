import 'package:intl/intl.dart';

/// Formats the server's decimal representation without a floating point conversion.
String exactMoney(String amount, String currency, String locale) {
  final match = RegExp(r'^(-?)(\d+)(?:\.(\d+))?$').firstMatch(amount);
  if (match == null) throw const FormatException('Invalid monetary decimal');
  final symbols = NumberFormat.decimalPattern(
    locale.startsWith('ar') ? 'ar_EG' : locale,
  ).symbols;
  final digits = match.group(2)!;
  final grouped = StringBuffer(match.group(1)!);
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) grouped.write(symbols.GROUP_SEP);
    grouped.write(digits[i]);
  }
  final fraction = match.group(3);
  if (fraction != null) grouped.write('${symbols.DECIMAL_SEP}$fraction');
  final zero = symbols.ZERO_DIGIT.runes.first;
  final localized = grouped.toString().replaceAllMapped(
    RegExp(r'\d'),
    (m) => String.fromCharCode(zero + int.parse(m[0]!)),
  );
  return '$localized $currency';
}

String financialDate(String value, String locale) =>
    DateFormat.yMMMd(locale).add_jm().format(DateTime.parse(value).toLocal());
