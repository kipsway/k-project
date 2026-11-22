import 'package:flutter/material.dart';
import 'colors.dart';

/// Типографика kStore по гайдлайнам Material You 3 Expressive.
/// Фирменный шрифт — Montserrat с выразительными плотными начертаниями.
class KTextStyles {
  KTextStyles._();

  static const String fontFamily = 'Montserrat';

  /// Заголовок главного экрана стора (28pt, w800, трекинг -0.5)
  static const TextStyle h1 = TextStyle(
    fontFamily: fontFamily,
    fontSize: 28,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.5,
    color: KColors.ink,
    height: 1.15,
  );

  /// Название мода в карточке (18pt, w800, трекинг -0.3)
  static const TextStyle cardTitle = TextStyle(
    fontFamily: fontFamily,
    fontSize: 18,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.3,
    color: KColors.ink,
    height: 1.2,
  );

  /// Метка автора «by kipsway» (13pt, w700, акцентная лаванда)
  static const TextStyle author = TextStyle(
    fontFamily: fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w700,
    color: KColors.lav,
    height: 1.2,
  );

  /// Описание мода (13pt, w500, мягкий приглушенный текст)
  static const TextStyle description = TextStyle(
    fontFamily: fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w500,
    color: KColors.muted,
    height: 1.35,
  );

  /// Текст на кнопке действия «Установить» / «Обновить» (14pt, w700)
  static const TextStyle buttonAction = TextStyle(
    fontFamily: fontFamily,
    fontSize: 14,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.2,
    color: KColors.lavInk,
  );

  /// Текст на кнопке в состоянии «Установлено» (14pt, w600)
  static const TextStyle buttonInstalled = TextStyle(
    fontFamily: fontFamily,
    fontSize: 14,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.2,
    color: KColors.ink,
  );

  /// Бейджи версий и параметров (11pt, w700)
  static const TextStyle badge = TextStyle(
    fontFamily: fontFamily,
    fontSize: 11,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.1,
    color: KColors.ink,
  );

  /// Рейтинг мода (13pt, w800)
  static const TextStyle rating = TextStyle(
    fontFamily: fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w800,
    color: KColors.ink,
  );

  /// Текст плавающего бара загрузки (13pt, w700)
  static const TextStyle progressText = TextStyle(
    fontFamily: fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.2,
    color: KColors.lavInk,
  );

  /// Подписи навигационного дока (11pt, w600)
  static const TextStyle dockLabel = TextStyle(
    fontFamily: fontFamily,
    fontSize: 11,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.1,
    color: KColors.muted,
  );

  /// Активная подпись навигационного дока (11pt, w700)
  static const TextStyle dockLabelActive = TextStyle(
    fontFamily: fontFamily,
    fontSize: 11,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.1,
    color: KColors.lav,
  );
}
