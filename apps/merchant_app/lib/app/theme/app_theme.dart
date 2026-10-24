import 'package:flutter/material.dart';

class FleetoraTheme {
  static const navy = Color(0xff102a43);
  static const teal = Color(0xff0f9f95);
  static ThemeData light() => ThemeData(
    useMaterial3: true,
    fontFamily: 'NotoSansArabic',
    colorScheme: ColorScheme.fromSeed(seedColor: teal).copyWith(
      primary: const Color(0xff0b817a),
      secondary: navy,
      surface: Colors.white,
      error: const Color(0xffc2414b),
    ),
    scaffoldBackgroundColor: const Color(0xfff5f7fa),
    appBarTheme: const AppBarTheme(
      backgroundColor: navy,
      foregroundColor: Colors.white,
      centerTitle: false,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xffe3eaf0)),
      ),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xffe3eaf0)),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(48, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(minimumSize: const Size(48, 48)),
    ),
  );
}
