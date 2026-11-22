import 'package:flutter/material.dart';

/// Цветовая палитра экосистемы k-Ecosystem (by kipsway).
/// Построена на дизайн-системе «Мозаика» от Rish (chat.eblo.id, chatterino_plus/page.css).
class KColors {
  KColors._();

  // Основные поверхности
  static const bg = Color(0xFF0A0A0C);          // Глубокий оникс (фон приложения)
  static const panel = Color(0xFF0F0F12);       // Карточки модов и подложки
  static const cellOff = Color(0xFF1C1B21);     // Вторичные подложки и кнопки-чипы
  static const panelBorder = Color(0xFF2C2B32); // Тонкая граница 1px
  static const borderWell = Color(0xFF1F1E24);  // Внутренние разделители

  // Типографика (Ink)
  static const ink = Color(0xFFECEBF1);         // Основной высококонтрастный текст
  static const muted = Color(0xFF8D8A99);       // Второстепенный текст и описания
  static const faint = Color(0xFF6F6C7A);       // Метаданные и неактивные элементы

  // Лавандовый акцент (Chatterino+ Lav)
  static const lav = Color(0xFFB8A7F0);         // Главный акцент (кнопки, прогресс-бар)
  static const lavInk = Color(0xFFD9CFFD);      // Светлая лаванда для текста на акцентных плашках
  static const accBg = Color(0xFF2A2442);       // Подложка активных капсул
  static const accBorder = Color(0xFF7E6FC4);   // Рамка активных элементов

  // Статусы
  static const green = Color(0xFF3FB950);       // Установлено / Активно
  static const red = Color(0xFFF24D5C);         // Ошибка / Сбой
  static const badSurface = Color(0xFF261A1D);  // Подложка предупреждений

  // Жидкое стекло (Liquid Glass)
  static const glassBorderTop = Color(0x2EFFFFFF); // Верхний линзовый блик (18% white)
  static const glassBorderBottom = Color(0x05FFFFFF); // Нижняя граница (2% white)
  static const glassSurface = Color(0xCC0F0F12); // Полупрозрачная подложка с блюром
}
