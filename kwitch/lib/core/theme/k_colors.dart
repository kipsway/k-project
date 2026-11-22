import 'package:flutter/material.dart';

/// Дизайн-система «Мозаика» от Rish (Chatterino+, chat.eblo.id)
/// Адаптирована для kWitch by kipsway
class KColors {
  // Базовые поверхности
  static const Color bg = Color(0xFF0A0A0C);           // Глубокий оникс (основной фон)
  static const Color panel = Color(0xFF0F0F12);        // Поверхности панелей и карточек
  static const Color panelBorder = Color(0xFF2C2B32);  // Тонкая разделительная рамка 1px
  static const Color cellOff = Color(0xFF1C1B21);      // Вторичные подложки контролов
  static const Color cellDim = Color(0xFF36353E);      // Приглушенные разделители
  static const Color cellOn = Color(0xFFD7D4DF);       // Активные маркеры
  static const Color well = Color(0xFF0B0B0D);         // Углубленные поля (инпуты)
  static const Color wellBorder = Color(0xFF1F1E24);   // Рамка полей ввода

  // Типографика
  static const Color ink = Color(0xFFECEBF1);          // Основной текст высокой читаемости
  static const Color muted = Color(0xFF8D8A99);        // Второстепенный текст и метки
  static const Color faint = Color(0xFF6F6C7A);        // Неактивные подписи и плейсхолдеры

  // Фирменная лаванда Chatterino+
  static const Color lav = Color(0xFFB8A7F0);          // Главный лавандовый акцент
  static const Color lavInk = Color(0xFFD9CFFD);       // Светлая лаванда для текста и бликов
  static const Color accBg = Color(0xFF2A2442);        // Подложка активной кнопки / капсулы
  static const Color accBorder = Color(0xFF7E6FC4);    // Рамка активных контролов и свечение

  // Статусные цвета
  static const Color green = Color(0xFF3FB950);        // Успех, стабильный туннель
  static const Color greenInk = Color(0xFF85C79D);     // Светло-зеленый текст
  static const Color red = Color(0xFFF24D5C);          // Прямой эфир (Live), ошибки
  static const Color redInk = Color(0xFFFF8A95);       // Розово-красный текст
  static const Color yellow = Color(0xFFE0B64A);       // Предупреждения, средний пинг

  // k-Tunnel акценты
  static const Color tunnelActive = Color(0xFF9D86E9); // Активный неоновый свет туннеля
  static const Color glassBorderTop = Color(0x2EFFFFFF); // Линзовый блик 18% сверху
  static const Color glassBorderBottom = Color(0x05FFFFFF); // Нижняя граница стекла 2%
}
