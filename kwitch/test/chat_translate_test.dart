import 'package:flutter_test/flutter_test.dart';
import '../lib/features/chat/domain/services/chat_translate_service.dart';

void main() {
  group('ChatTranslateService Tests', () {
    test('Initial state is enabled with Russian target language', () {
      final service = ChatTranslateService();

      expect(service.isEnabled, isTrue);
      expect(service.targetLanguage, equals('ru'));
      expect(service.autoTranslateForeign, isFalse);
      expect(service.preserveEmotes, isTrue);
      expect(service.cachedTranslationsCount, equals(0));
    });

    test('Language detection accurately identifies Cyrillic, Latin, Hangul, and Kana', () {
      final service = ChatTranslateService();

      expect(service.detectLanguage('Привет всем в чате стрима'), equals('ru'));
      expect(service.detectLanguage('What a crazy clutch play!'), equals('en'));
      expect(service.detectLanguage('안녕하세요 페이커 화이팅'), equals('ko'));
      expect(service.detectLanguage('こんにちは すごい プレイ'), equals('ja'));
    });

    test('shouldOfferTranslation filters out native target language and too short texts', () {
      final service = ChatTranslateService();

      // На русском при целевом 'ru' перевод предлагать не нужно
      expect(service.shouldOfferTranslation('Всем привет'), isFalse);

      // Слишком короткие фразы (меньше minTextLength = 4)
      expect(service.shouldOfferTranslation('gg'), isFalse);
      expect(service.shouldOfferTranslation('+'), isFalse);

      // Зарубежные сообщения требуют перевода
      expect(service.shouldOfferTranslation('Is he really doing this right now?'), isTrue);
      expect(service.shouldOfferTranslation('대박 레전드 게임'), isTrue);
    });

    test('Twitch gaming slang is translated with context dictionary', () async {
      final service = ChatTranslateService();

      final res1 = await service.translateMessage('skill issue');
      expect(res1.translatedText, equals('проблема с навыком'));

      final res2 = await service.translateMessage('ggwp');
      expect(res2.translatedText, contains('отличная игра'));

      final res3 = await service.translateMessage('no cap');
      expect(res3.translatedText, equals('чистая правда'));
    });

    test('Translations are cached in LRU cache and returned with isFromCache=true', () async {
      final service = ChatTranslateService();

      const text = 'look at this play';
      final first = await service.translateMessage(text);
      expect(first.isFromCache, isFalse);
      expect(service.cachedTranslationsCount, equals(1));

      final second = await service.translateMessage(text);
      expect(second.isFromCache, isTrue);
      expect(second.translatedText, equals(first.translatedText));
      expect(service.cachedTranslationsCount, equals(1));

      service.clearCache();
      expect(service.cachedTranslationsCount, equals(0));
    });

    test('Target language change clears cache and updates settings', () {
      final service = ChatTranslateService();
      bool notified = false;
      service.addListener(() => notified = true);

      service.setTargetLanguage('en');
      expect(service.targetLanguage, equals('en'));
      expect(notified, isTrue);

      service.toggleAutoTranslate(true);
      expect(service.autoTranslateForeign, isTrue);

      service.togglePreserveEmotes(false);
      expect(service.preserveEmotes, isFalse);

      service.toggleEnabled(false);
      expect(service.isEnabled, isFalse);
      expect(service.shouldOfferTranslation('Any message'), isFalse);
    });

    test('generateInlineTranslationJs generates valid script with MutationObserver', () {
      final service = ChatTranslateService();
      final js = service.generateInlineTranslationJs();

      expect(js, contains('MutationObserver'));
      expect(js, contains('cpx-translate-btn'));
      expect(js, contains('cpx-inline-translation'));
      expect(js, contains('TARGET_LANG = "ru"'));
    });
  });
}
