import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// রং ও থিম — রাস্তা/অ্যাসফল্ট + সতর্কতা-কমলা রঙের প্যালেট।
class AppColors {
  static const asphalt = Color(0xFF14181D);
  static const asphaltLight = Color(0xFF1E252C);
  static const card = Color(0xFF242C34);
  static const border = Color(0xFF32404D);
  static const amber = Color(0xFFF2A33D);
  static const amberDark = Color(0xFFB86F13);
  static const textPrimary = Color(0xFFEDF1F5);
  static const textMuted = Color(0xFF95A3B0);
  static const danger = Color(0xFFE0553E);
  static const warn = Color(0xFFE0A83E);
  static const ok = Color(0xFF3EA05C);
  static const info = Color(0xFF3E8FE0);
}

ThemeData buildAppTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  final textTheme = GoogleFonts.hindSiliguriTextTheme(base.textTheme).apply(
    bodyColor: AppColors.textPrimary,
    displayColor: AppColors.textPrimary,
  );

  return base.copyWith(
    scaffoldBackgroundColor: AppColors.asphalt,
    textTheme: textTheme,
    primaryTextTheme: textTheme,
    colorScheme: base.colorScheme.copyWith(
      primary: AppColors.amber,
      secondary: AppColors.amberDark,
      surface: AppColors.card,
      error: AppColors.danger,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: AppColors.asphaltLight,
      foregroundColor: AppColors.textPrimary,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
    ),
    cardTheme: CardThemeData(
      color: AppColors.card,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppColors.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.asphaltLight,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.amber, width: 1.6),
      ),
      labelStyle: const TextStyle(color: AppColors.textMuted),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.amber,
        foregroundColor: AppColors.asphalt,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
      ),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: AppColors.asphaltLight,
      selectedItemColor: AppColors.amber,
      unselectedItemColor: AppColors.textMuted,
      type: BottomNavigationBarType.fixed,
    ),
    dividerColor: AppColors.border,
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: AppColors.asphaltLight,
      side: const BorderSide(color: AppColors.border),
      labelStyle: const TextStyle(color: AppColors.textPrimary),
    ),
  );
}

Color severityColor(String severity) {
  switch (severity) {
    case 'high':
      return AppColors.danger;
    case 'medium':
      return AppColors.warn;
    default:
      return AppColors.info;
  }
}

Color statusColor(String status) {
  switch (status) {
    case 'resolved':
      return AppColors.ok;
    case 'rejected':
      return AppColors.danger;
    case 'forwarded':
      return AppColors.info;
    case 'in_progress':
      return AppColors.amber;
    default:
      return AppColors.textMuted;
  }
}
