import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import '../lib/core/theme/k_colors.dart';

void main() {
  group('KColors Theme Tests (Chatterino+ "Мозаика" by Rish)', () {
    test('Background is deep onyx #0A0A0C', () {
      expect(KColors.bg.value, equals(0xFF0A0A0C));
    });

    test('Panel is #0F0F12', () {
      expect(KColors.panel.value, equals(0xFF0F0F12));
    });

    test('Primary accent lavender is #B8A7F0', () {
      expect(KColors.lav.value, equals(0xFFB8A7F0));
    });

    test('Active control border is #7E6FC4', () {
      expect(KColors.accBorder.value, equals(0xFF7E6FC4));
    });

    test('Contrast ratio between ink (#ECEBF1) and bg (#0A0A0C) meets WCAG AAA', () {
      final lumInk = KColors.ink.computeLuminance();
      final lumBg = KColors.bg.computeLuminance();
      final contrast = (lumInk + 0.05) / (lumBg + 0.05);

      // Контрастность должна быть выше 7.0 для AAA
      expect(contrast, greaterThan(7.0));
    });
  });
}
