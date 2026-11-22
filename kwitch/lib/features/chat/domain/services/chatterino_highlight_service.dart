import 'package:flutter/material.dart';
import '../models/chatterino_highlight_rule.dart';

/// Сервис подсветки ключевых слов, упоминаний и ролей в чате Chatterino+ (by Rish)
class ChatterinoHighlightService extends ChangeNotifier {
  String _currentUsername;
  final List<ChatterinoHighlightRule> _rules = [];

  String get currentUsername => _currentUsername;
  List<ChatterinoHighlightRule> get rules => List.unmodifiable(_rules);

  ChatterinoHighlightService({String defaultUsername = 'kipsway'})
      : _currentUsername = defaultUsername {
    _initDefaultRules();
  }

  void _initDefaultRules() {
    _rules.addAll([
      // Упоминание текущего пользователя (@kipsway)
      ChatterinoHighlightRule(
        id: 'rule_self_mention',
        pattern: _currentUsername,
        isSelfMention: true,
        label: 'Моё имя (@$_currentUsername)',
        color: const Color(0xFF7E6FC4), // Акцентная лаванда Chatterino+
        playSound: true,
        isEnabled: true,
      ),
      // Сообщения стримера (Broadcaster)
      const ChatterinoHighlightRule(
        id: 'rule_streamer',
        pattern: '[стример]',
        label: 'Сообщения стримера',
        color: Color(0xFFF59E0B), // Золотистый янтарный
        playSound: true,
        isEnabled: true,
      ),
      // Сообщения модераторов
      const ChatterinoHighlightRule(
        id: 'rule_moderator',
        pattern: '[модератор]',
        label: 'Сообщения модераторов',
        color: Color(0xFF10B981), // Изумрудный зеленый
        playSound: false,
        isEnabled: true,
      ),
      // Ключевые слова дропов и розыгрышей
      const ChatterinoHighlightRule(
        id: 'rule_giveaways',
        pattern: 'giveaway|розыгрыш|дроп',
        isRegex: true,
        label: 'Дропы и розыгрыши',
        color: Color(0xFFB8A7F0), // Мягкая светлая лаванда
        playSound: false,
        isEnabled: true,
      ),
    ]);
  }

  /// Обновление имени пользователя для авто-подсветки
  void setCurrentUsername(String username) {
    if (_currentUsername == username || username.trim().isEmpty) return;
    _currentUsername = username.trim();

    // Обновляем паттерн правила self_mention
    final index = _rules.indexWhere((r) => r.isSelfMention);
    if (index != -1) {
      _rules[index] = _rules[index].copyWith(
        pattern: _currentUsername,
        label: 'Моё имя (@$_currentUsername)',
      );
    }
    notifyListeners();
  }

  /// Проверка входящего сообщения на соответствие правилам подсветки
  HighlightMatchResult? checkMessage({
    required String text,
    required String senderUsername,
    bool isBroadcaster = false,
    bool isMod = false,
  }) {
    // 1. Проверка сообщений стримера
    if (isBroadcaster) {
      final streamerRule = _rules.firstWhere(
        (r) => r.id == 'rule_streamer',
        orElse: () => const ChatterinoHighlightRule(id: '', pattern: '', isEnabled: false),
      );
      if (streamerRule.isEnabled) {
        return HighlightMatchResult(
          rule: streamerRule,
          matchedText: 'Стример',
          color: streamerRule.color,
          playSound: streamerRule.playSound,
        );
      }
    }

    // 2. Проверка сообщений модераторов
    if (isMod) {
      final modRule = _rules.firstWhere(
        (r) => r.id == 'rule_moderator',
        orElse: () => const ChatterinoHighlightRule(id: '', pattern: '', isEnabled: false),
      );
      if (modRule.isEnabled) {
        return HighlightMatchResult(
          rule: modRule,
          matchedText: 'Модератор',
          color: modRule.color,
          playSound: modRule.playSound,
        );
      }
    }

    // 3. Проверка текстовых совпадений и упоминаний
    for (final rule in _rules) {
      if (!rule.isEnabled) continue;

      if (rule.isSelfMention) {
        // Проверяем как полное имя, так и @никнейм
        final lowerText = text.toLowerCase();
        final lowerName = _currentUsername.toLowerCase();
        if (lowerText.contains('@$lowerName') || lowerText.contains(lowerName)) {
          return HighlightMatchResult(
            rule: rule,
            matchedText: '@$_currentUsername',
            color: rule.color,
            playSound: rule.playSound,
          );
        }
      } else if (rule.id != 'rule_streamer' && rule.id != 'rule_moderator') {
        if (rule.matches(text)) {
          return HighlightMatchResult(
            rule: rule,
            matchedText: rule.pattern,
            color: rule.color,
            playSound: rule.playSound,
          );
        }
      }
    }

    return null;
  }

  /// Добавление нового кастомного правила
  void addRule({
    required String pattern,
    String? label,
    bool isRegex = false,
    bool isCaseSensitive = false,
    Color color = const Color(0xFF7E6FC4),
    bool playSound = true,
  }) {
    if (pattern.trim().isEmpty) return;

    final rule = ChatterinoHighlightRule(
      id: 'rule_${DateTime.now().millisecondsSinceEpoch}',
      pattern: pattern.trim(),
      label: label ?? pattern.trim(),
      isRegex: isRegex,
      isCaseSensitive: isCaseSensitive,
      color: color,
      playSound: playSound,
      isEnabled: true,
    );
    _rules.add(rule);
    notifyListeners();
  }

  /// Удаление правила
  void removeRule(String id) {
    _rules.removeWhere((r) => r.id == id && !r.isSelfMention);
    notifyListeners();
  }

  /// Включение/отключение правила
  void toggleRule(String id, [bool? enabled]) {
    final index = _rules.indexWhere((r) => r.id == id);
    if (index != -1) {
      final cur = _rules[index];
      _rules[index] = cur.copyWith(isEnabled: enabled ?? !cur.isEnabled);
      notifyListeners();
    }
  }

  /// Обновление цвета правила
  void updateRuleColor(String id, Color newColor) {
    final index = _rules.indexWhere((r) => r.id == id);
    if (index != -1) {
      _rules[index] = _rules[index].copyWith(color: newColor);
      notifyListeners();
    }
  }

  /// Генерация CSS-правил для инжекции в WebView Chatterino+
  String generateCssStyles() {
    final buffer = StringBuffer();
    buffer.writeln('/* Chatterino+ Highlights Rules by kWitch */');
    for (final rule in _rules) {
      if (!rule.isEnabled) continue;
      final hex = rule.colorHex;
      buffer.writeln('''
.cpx-highlight-${rule.id} {
  background: ${hex}18 !important;
  border-left: 3px solid $hex !important;
  border-radius: 4px !important;
  padding-left: 6px !important;
}
''');
    }
    return buffer.toString();
  }
}
