import 'package:flutter/foundation.dart';

/// Результат проверки сообщения фильтром спама
class SpamFilterResult {
  final bool isBlocked;
  final String? blockReason;

  const SpamFilterResult({
    required this.isBlocked,
    this.blockReason,
  });

  static const allowed = SpamFilterResult(isBlocked: false);
}

/// Сервис фильтрации спама, ботов и нежелательных слов в Chatterino+ для kWitch
class ChatterinoSpamFilterService extends ChangeNotifier {
  bool _hideBotMessages = true;
  bool _filterLinks = true;
  bool _deduplicateCopypasta = true;

  final Set<String> _knownBots = {
    'nightbot',
    'streamelements',
    'moobot',
    'wizebot',
    'fossabot',
    'stay_hydrated_bot',
    'crewtv',
    'soundalerts',
    'botisimo',
  };

  final List<String> _blacklistWords = [];

  // Кэш последних сообщений для дедупликации копипасты
  final List<String> _recentMessages = [];
  static const int _maxRecentMessages = 30;

  bool get hideBotMessages => _hideBotMessages;
  bool get filterLinks => _filterLinks;
  bool get deduplicateCopypasta => _deduplicateCopypasta;
  List<String> get blacklistWords => List.unmodifiable(_blacklistWords);
  Set<String> get knownBots => Set.unmodifiable(_knownBots);

  ChatterinoSpamFilterService() {
    // Начальный базовый фильтр
    _blacklistWords.addAll(['t.me/', 'discord.gg/', 'twitch.tv/p/']);
  }

  /// Проверка сообщения на спам/ботов/черный список
  SpamFilterResult shouldFilterMessage({
    required String text,
    required String senderUsername,
  }) {
    final cleanSender = senderUsername.trim().toLowerCase();
    final cleanText = text.trim();

    // 1. Проверка на известного бота
    if (_hideBotMessages && _knownBots.contains(cleanSender)) {
      return const SpamFilterResult(isBlocked: true, blockReason: 'Сообщение бота');
    }

    // 2. Проверка на внешние ссылки
    if (_filterLinks) {
      final linkRegExp = RegExp(r'(https?:\/\/|www\.)[^\s]+', caseSensitive: false);
      if (linkRegExp.hasMatch(cleanText)) {
        return const SpamFilterResult(isBlocked: true, blockReason: 'Сторонняя ссылка');
      }
    }

    // 3. Проверка по черному списку слов и регулярных выражений
    final lowerText = cleanText.toLowerCase();
    for (final word in _blacklistWords) {
      if (word.trim().isEmpty) continue;
      if (lowerText.contains(word.toLowerCase())) {
        return SpamFilterResult(isBlocked: true, blockReason: 'Черный список: "$word"');
      }
    }

    // 4. Дедупликация копипасты (если точно такое же сообщение уже было отправлено 3+ раза)
    if (_deduplicateCopypasta && cleanText.length > 12) {
      final duplicateCount = _recentMessages.where((m) => m == cleanText).length;
      if (duplicateCount >= 2) {
        return const SpamFilterResult(isBlocked: true, blockReason: 'Копипаста');
      }
      _recentMessages.insert(0, cleanText);
      if (_recentMessages.length > _maxRecentMessages) {
        _recentMessages.removeLast();
      }
    }

    return SpamFilterResult.allowed;
  }

  /// Добавление слова в черный список
  void addBlacklistWord(String word) {
    final clean = word.trim().toLowerCase();
    if (clean.isNotEmpty && !_blacklistWords.contains(clean)) {
      _blacklistWords.add(clean);
      notifyListeners();
    }
  }

  /// Удаление слова из черного списка
  void removeBlacklistWord(String word) {
    if (_blacklistWords.remove(word.trim().toLowerCase())) {
      notifyListeners();
    }
  }

  /// Добавление пользовательского бота
  void addCustomBot(String botUsername) {
    final clean = botUsername.trim().toLowerCase();
    if (clean.isNotEmpty) {
      _knownBots.add(clean);
      notifyListeners();
    }
  }

  void toggleHideBots([bool? value]) {
    _hideBotMessages = value ?? !_hideBotMessages;
    notifyListeners();
  }

  void toggleFilterLinks([bool? value]) {
    _filterLinks = value ?? !_filterLinks;
    notifyListeners();
  }

  void toggleDeduplicateCopypasta([bool? value]) {
    _deduplicateCopypasta = value ?? !_deduplicateCopypasta;
    notifyListeners();
  }

  /// Генерация CSS-правил для скрытия строк ботов в WebView Chatterino+
  String generateCssHidingRules() {
    if (!_hideBotMessages) return '';
    final buffer = StringBuffer();
    buffer.writeln('/* Chatterino+ Bot Hiding Rules */');
    for (final bot in _knownBots) {
      buffer.writeln('.cpx-message[data-sender="$bot"] { display: none !important; }');
    }
    return buffer.toString();
  }
}
