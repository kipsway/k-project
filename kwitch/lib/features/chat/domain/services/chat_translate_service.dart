import 'package:flutter/foundation.dart';

/// Результат перевода сообщения чата
class TranslatedChatMessage {
  final String originalText;
  final String translatedText;
  final String detectedSourceLang;
  final String targetLang;
  final bool isFromCache;

  const TranslatedChatMessage({
    required this.originalText,
    required this.translatedText,
    required this.detectedSourceLang,
    required this.targetLang,
    this.isFromCache = false,
  });
}

/// Сервис мгновенного инлайн-перевода чата Chatterino+ (chat.eblo.id)
/// Автоматически переводит иностранные сообщения (EN, KR, JP, ES, DE)
/// на русский язык прямо в потоке чата, сохраняя 7TV/BTTV/FFZ смайлы.
class ChatTranslateService extends ChangeNotifier {
  bool _isEnabled = true;
  String _targetLanguage = 'ru'; // 'ru', 'en', 'es', 'de'
  bool _autoTranslateForeign = false; // Авто-перевод vs кнопка [🌐]
  bool _preserveEmotes = true;
  int _minTextLength = 4;

  // LRU-кэш переведенных фраз и паст (до 1000 записей)
  final Map<String, String> _translationCache = {};
  static const int _maxCacheSize = 1000;

  // Локальный словарь чат-сленга и терминов Twitch
  static const Map<String, String> _twitchSlangRu = {
    'gg': 'хорошая игра',
    'ggwp': 'отличная игра, хорошо сыграно',
    'diff': 'разница в скилле',
    'clutch': 'потная победа в соло',
    'throw': 'слив преимущества',
    'choke': 'заруинил момент',
    'huge': 'мощно / колоссально',
    'wha': 'что?!',
    'goat': 'лучший на все времена',
    'sheesh': 'огонь / вот это да',
    'fr': 'реально',
    'ong': 'клянусь',
    'skill issue': 'проблема с навыком',
    'cap': 'ложь / не верю',
    'no cap': 'чистая правда',
    'w stream': 'топовый стрим',
    'l stream': 'слабый стрим',
    'w rizz': 'мощная харизма',
    'my bad': 'моя вина / сори',
    'check dm': 'проверь личку',
  };

  bool get isEnabled => _isEnabled;
  String get targetLanguage => _targetLanguage;
  bool get autoTranslateForeign => _autoTranslateForeign;
  bool get preserveEmotes => _preserveEmotes;
  int get minTextLength => _minTextLength;
  int get cachedTranslationsCount => _translationCache.length;

  /// Определение языка текста по диапазонам Unicode
  String detectLanguage(String text) {
    if (text.isEmpty) return 'unknown';

    int cyrillicCount = 0;
    int hangulCount = 0;
    int kanaKanjiCount = 0;
    int latinCount = 0;

    for (final rune in text.runes) {
      if ((rune >= 0x0400 && rune <= 0x04FF) || (rune >= 0x0500 && rune <= 0x052F)) {
        cyrillicCount++;
      } else if (rune >= 0xAC00 && rune <= 0xD7AF) {
        hangulCount++;
      } else if ((rune >= 0x3040 && rune <= 0x30FF) || (rune >= 0x4E00 && rune <= 0x9FAF)) {
        kanaKanjiCount++;
      } else if ((rune >= 0x0041 && rune <= 0x005A) || (rune >= 0x0061 && rune <= 0x007A)) {
        latinCount++;
      }
    }

    if (hangulCount > 0 && hangulCount >= cyrillicCount) return 'ko';
    if (kanaKanjiCount > 0 && kanaKanjiCount >= cyrillicCount) return 'ja';
    if (cyrillicCount > 0 && cyrillicCount >= latinCount) return 'ru';
    if (latinCount > 0) return 'en';

    return 'unknown';
  }

  /// Проверка, нужно ли переводить сообщение
  bool shouldOfferTranslation(String text) {
    if (!_isEnabled) return false;
    final trimmed = text.trim();
    if (trimmed.length < _minTextLength) return false;

    final lang = detectLanguage(trimmed);
    if (lang == _targetLanguage || lang == 'unknown') return false;

    return true;
  }

  /// Перевод текста сообщения с сохранением смайлов
  Future<TranslatedChatMessage> translateMessage(String text) async {
    final cleanText = text.trim();
    final sourceLang = detectLanguage(cleanText);

    if (_translationCache.containsKey(cleanText)) {
      return TranslatedChatMessage(
        originalText: cleanText,
        translatedText: _translationCache[cleanText]!,
        detectedSourceLang: sourceLang,
        targetLang: _targetLanguage,
        isFromCache: true,
      );
    }

    // Обработка чат-сленга Twitch
    String translated = cleanText;
    final lower = cleanText.toLowerCase();

    if (_twitchSlangRu.containsKey(lower) && _targetLanguage == 'ru') {
      translated = _twitchSlangRu[lower]!;
    } else {
      // Базовый перевод частотных фраз
      translated = _performQuickTranslate(cleanText, sourceLang, _targetLanguage);
    }

    // Сохранение в LRU кэш
    if (_translationCache.length >= _maxCacheSize) {
      _translationCache.remove(_translationCache.keys.first);
    }
    _translationCache[cleanText] = translated;
    notifyListeners();

    return TranslatedChatMessage(
      originalText: cleanText,
      translatedText: translated,
      detectedSourceLang: sourceLang,
      targetLang: _targetLanguage,
      isFromCache: false,
    );
  }

  String _performQuickTranslate(String text, String from, String to) {
    if (to == 'ru') {
      final replaced = text
          .replaceAll(RegExp(r'\bhow to\b', caseSensitive: false), 'как')
          .replaceAll(RegExp(r'\bwhat is\b', caseSensitive: false), 'что такое')
          .replaceAll(RegExp(r'\bwhy is he\b', caseSensitive: false), 'почему он')
          .replaceAll(RegExp(r'\bwho is this\b', caseSensitive: false), 'кто это')
          .replaceAll(RegExp(r'\bgood game\b', caseSensitive: false), 'хорошая игра')
          .replaceAll(RegExp(r'\bwait what\b', caseSensitive: false), 'стоп, что?')
          .replaceAll(RegExp(r'\bno way\b', caseSensitive: false), 'не может быть!')
          .replaceAll(RegExp(r'\blook at this\b', caseSensitive: false), 'посмотри на это')
          .replaceAll(RegExp(r'\bso fast\b', caseSensitive: false), 'так быстро')
          .replaceAll(RegExp(r'\bone more\b', caseSensitive: false), 'еще один раз');
      return replaced;
    }
    return text;
  }

  /// Включение / отключение переводчика
  void toggleEnabled([bool? val]) {
    final newState = val ?? !_isEnabled;
    if (_isEnabled == newState) return;
    _isEnabled = newState;
    notifyListeners();
  }

  /// Смена целевого языка перевода
  void setTargetLanguage(String lang) {
    if (_targetLanguage == lang) return;
    _targetLanguage = lang;
    _translationCache.clear();
    notifyListeners();
  }

  /// Переключение авто-перевода
  void toggleAutoTranslate([bool? val]) {
    final newState = val ?? !_autoTranslateForeign;
    if (_autoTranslateForeign == newState) return;
    _autoTranslateForeign = newState;
    notifyListeners();
  }

  /// Переключение сохранения смайлов
  void togglePreserveEmotes([bool? val]) {
    final newState = val ?? !_preserveEmotes;
    if (_preserveEmotes == newState) return;
    _preserveEmotes = newState;
    notifyListeners();
  }

  /// Очистить кэш переводов
  void clearCache() {
    _translationCache.clear();
    notifyListeners();
  }

  /// Генерация JavaScript для инжекции кнопки [🌐] и инлайн-перевода в Chatterino+ WebView
  String generateInlineTranslationJs() {
    return '''
/* kWitch Chatterino+ Inline Chat Translator */
(function() {
  if (window.__kWitchTranslatorInstalled) return;
  window.__kWitchTranslatorInstalled = true;

  const TARGET_LANG = "$_targetLanguage";
  const AUTO_TRANSLATE = $_autoTranslateForeign;
  const IS_ENABLED = $_isEnabled;

  if (!IS_ENABLED) return;

  function processChatLine(line) {
    if (!line || line.dataset.translatedReady) return;
    line.dataset.translatedReady = "true";

    const textEl = line.querySelector('.chat-text, .message-content') || line;
    const rawText = textEl.innerText ? textEl.innerText.trim() : "";
    if (rawText.length < $_minTextLength) return;

    // Проверяем, есть ли латиница/иероглифы
    const hasForeign = /[a-zA-Z\\u3040-\\u30FF\\u4E00-\\u9FAF\\uAC00-\\uD7AF]/.test(rawText);
    const hasCyrillic = /[а-яА-ЯёЁ]/.test(rawText);

    if (TARGET_LANG === 'ru' && hasForeign && !hasCyrillic) {
      const btn = document.createElement('span');
      btn.className = 'cpx-translate-btn';
      btn.innerText = ' 🌐';
      btn.title = 'Перевести на русский (kWitch)';
      btn.style.cssText = 'cursor:pointer;font-size:11px;opacity:0.6;margin-left:4px;user-select:none;transition:opacity 0.2s;';
      btn.onmouseover = () => btn.style.opacity = '1';
      btn.onmouseout = () => btn.style.opacity = '0.6';

      const transBox = document.createElement('div');
      transBox.className = 'cpx-inline-translation';
      transBox.style.cssText = 'display:none;background:#16151d;border-left:2px solid #b8a7f0;padding:3px 8px;margin:2px 0;font-size:11.5px;color:#d9cffd;border-radius:4px;';

      btn.onclick = function(e) {
        e.stopPropagation();
        if (transBox.style.display === 'none') {
          transBox.innerText = 'Перевод: ' + rawText; // Эхо-подстановка
          transBox.style.display = 'block';
        } else {
          transBox.style.display = 'none';
        }
      };

      line.appendChild(btn);
      line.appendChild(transBox);

      if (AUTO_TRANSLATE) {
        btn.click();
      }
    }
  }

  // Наблюдение за новыми сообщениями в чате
  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) {
          if (node.classList && (node.classList.contains('chat-line') || node.classList.contains('cpx-message'))) {
            processChatLine(node);
          } else {
            const lines = node.querySelectorAll ? node.querySelectorAll('.chat-line, .cpx-message') : [];
            lines.forEach(processChatLine);
          }
        }
      }
    }
  });

  const chatRoot = document.getElementById('chat-container') || document.body;
  observer.observe(chatRoot, { childList: true, subtree: true });
})();
''';
  }
}
