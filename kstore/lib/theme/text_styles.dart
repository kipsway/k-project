import 'package:flutter/material.dart';
import 'colors.dart';

/// Типографика kStore (Material You 3 + жирный Montserrat).
/// Сетка и пропорции строго следуют правилам «Сделано человеком».
class KTextStyles {
  KTextStyles._();

  static const _fontFamily = 'Montserrat';

  /// Крупный заголовок экрана (28pt, w800, плотный трекинг -0.5)
  static const screenTitle = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 28,
    fontWeight: FontWeight.w800,
    letterSpacing: -0.5,
    color: KColors.ink,
    height: 1.2,
  );

  /// Название мода в карточке (18pt, w700, трекинг -0.3)
  static const modTitle = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 18,
    fontWeight: FontWeight.w700,
    letterSpacing: -0.3,
    color: KColors.ink,
    height: 1.2,
  );

  /// Авторство («by kipsway», 12pt, w600)
  static const authorBadge = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 12,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.1,
    color: KColors.lav,
  );

  /// Краткое описание мода (13pt, w400, двухстрочное)
  static const description = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w400,
    letterSpacing: 0,
    color: KColors.muted,
    height: 1.35,
  );

  /// Текст кнопок-капсул («Установить», «Обновить», 13pt, w700)
  static const buttonCapsule = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.2,
    color: KColors.bg,
  );

  /// Текст активной капсулы («Установлено», «by kipsway», 13pt, w700)
  static const buttonCapsuleActive = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.2,
    color: KColors.lavInk,
  );

  /// Плавающий бар загрузки (12pt, w600)
  static const floatingProgress = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 12,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.1,
    color: KColors.ink,
  );

  /// Метаданные (версия, рейтинг, 11pt, w500)
  static const meta = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 11,
    fontWeight: FontWeight.w500,
    color: KColors.faint,
  );
}
