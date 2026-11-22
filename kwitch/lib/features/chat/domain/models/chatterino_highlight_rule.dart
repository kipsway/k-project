import 'package:flutter/material.dart';

/// Модель правила подсветки (Highlight Rule) для Chatterino+ в kWitch
class ChatterinoHighlightRule {
  final String id;
  final String pattern;
  final bool isRegex;
  final bool isCaseSensitive;
  final Color color;
  final bool playSound;
  final bool isEnabled;
  final bool isSelfMention;
  final String label;

  const ChatterinoHighlightRule({
    required this.id,
    required this.pattern,
    this.isRegex = false,
    this.isCaseSensitive = false,
    this.color = const Color(0xFF7E6FC4), // Акцентная лаванда Chatterino+
    this.playSound = true,
    this.isEnabled = true,
    this.isSelfMention = false,
    this.label = '',
  });

  ChatterinoHighlightRule copyWith({
    String? pattern,
    bool? isRegex,
    bool? isCaseSensitive,
    Color? color,
    bool? playSound,
    bool? isEnabled,
    bool? isSelfMention,
    String? label,
  }) {
    return ChatterinoHighlightRule(
      id: id,
      pattern: pattern ?? this.pattern,
      isRegex: isRegex ?? this.isRegex,
      isCaseSensitive: isCaseSensitive ?? this.isCaseSensitive,
      color: color ?? this.color,
      playSound: playSound ?? this.playSound,
      isEnabled: isEnabled ?? this.isEnabled,
      isSelfMention: isSelfMention ?? this.isSelfMention,
      label: label ?? this.label,
    );
  }

  /// Проверка совпадения текста сообщения с правилом
  bool matches(String text) {
    if (!isEnabled || pattern.trim().isEmpty) return false;

    if (isRegex) {
      try {
        final reg = RegExp(pattern, caseSensitive: isCaseSensitive);
        return reg.hasMatch(text);
      } catch (_) {
        return false;
      }
    }

    if (isCaseSensitive) {
      return text.contains(pattern);
    } else {
      return text.toLowerCase().contains(pattern.toLowerCase());
    }
  }

  /// Hex-код цвета для CSS-инжекции
  String get colorHex {
    return '#${color.value.toRadixString(16).padLeft(8, '0').substring(2)}';
  }
}

/// Результат проверки сообщения на подсветку
class HighlightMatchResult {
  final ChatterinoHighlightRule rule;
  final String matchedText;
  final Color color;
  final bool playSound;

  const HighlightMatchResult({
    required this.rule,
    required this.matchedText,
    required this.color,
    required this.playSound,
  });
}
