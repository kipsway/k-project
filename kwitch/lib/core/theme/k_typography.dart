import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'k_colors.dart';

class KTypography {
  static TextStyle get titleBold => GoogleFonts.montserrat(
        fontSize: 18,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.5,
        color: KColors.ink,
      );

  static TextStyle get sectionHeader => GoogleFonts.montserrat(
        fontSize: 15,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.3,
        color: KColors.ink,
      );

  static TextStyle get body => GoogleFonts.montserrat(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        color: KColors.ink,
      );

  static TextStyle get bodyMuted => GoogleFonts.montserrat(
        fontSize: 13,
        fontWeight: FontWeight.w500,
        color: KColors.muted,
      );

  static TextStyle get caption => GoogleFonts.montserrat(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: KColors.muted,
      );

  static TextStyle get chipLabel => GoogleFonts.montserrat(
        fontSize: 12,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.2,
        color: KColors.ink,
      );

  static TextStyle get monoStats => const TextStyle(
        fontFamily: 'Cascadia Mono, Consolas, monospace',
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: KColors.lavInk,
      );
}
