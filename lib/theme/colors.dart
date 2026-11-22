import 'package:flutter/material.dart';

/// Цветовая палитра kStore на основе дизайн-системы «Мозаика» от Rish (Chatterino+, chat.eblo.id).
class KColors {
  KColors._();

  // Фон и поверхности
  static const Color bg = Color(0xFF0A0A0C);          // Глубокий оникс (основной фон)
  static const Color panel = Color(0xFF0F0F12);       // Карточки модов (основная панель)
  static const Color cellOff = Color(0xFF1C1B21);     // Вторичные подложки и бейджи
  static const Color panelBorder = Color(0xFF2C2B32); // Тонкая базовая рамка 1px

  // Текст и контраст
  static const Color ink = Color(0xFFECEBF1);         // Главный текст (высокий контраст)
  static const Color muted = Color(0xFF8D8A99);       // Второстепенный текст и подписи
  static const Color faint = Color(0xFF6F6C7A);       // Неактивные элементы и плейсхолдеры

  // Лавандовые акценты (Chatterino+)
  static const Color lav = Color(0xFFB8A7F0);         // Лавандовый акцент (иконки, кнопки)
  static const Color lavInk = Color(0xFFD9CFFD);      // Светлая лаванда для текста кнопок
  static const Color accBg = Color(0xFF2A2442);       // Подложка активной кнопки
  static const Color accBorder = Color(0xFF7E6FC4);   // Рамка активной кнопки

  // Статусы
  static const Color green = Color(0xFF3FB950);       // Установлено / Успех
  static const Color red = Color(0xFFF24D5C);         // Ошибка / Внимание

  // Градиенты для эффекта жидкого стекла (линзовый блик на верхней грани)
  static const LinearGradient glassBorderGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [
      Color(0x2EFFFFFF), // rgba(255, 255, 255, 0.18) — яркий верхний блик
      Color(0x05FFFFFF), // rgba(255, 255, 255, 0.02) — мягкое растворение вниз
    ],
  );

  // Полупрозрачная стеклянная подложка
  static const LinearGradient glassSurfaceGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [
      Color(0x1F1C1B21), // Мягкий оттенок вторичной подложки
      Color(0x140F0F12), // Полупрозрачный оникс
    ],
  );
}
