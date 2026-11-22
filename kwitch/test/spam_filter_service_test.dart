import 'package:flutter_test/flutter_test.dart';
import '../lib/features/chat/domain/services/chatterino_spam_filter_service.dart';

void main() {
  group('ChatterinoSpamFilterService Tests', () {
    test('Known bot messages are filtered when hideBotMessages is enabled', () {
      final service = ChatterinoSpamFilterService();

      final nightbotResult = service.shouldFilterMessage(
        text: 'Текущий трек: Noisia - Collider',
        senderUsername: 'Nightbot',
      );
      expect(nightbotResult.isBlocked, isTrue);
      expect(nightbotResult.blockReason, contains('бота'));

      final seResult = service.shouldFilterMessage(
        text: 'Подписывайтесь на соцсети стримера!',
        senderUsername: 'StreamElements',
      );
      expect(seResult.isBlocked, isTrue);

      // Обычный зритель не блокируется
      final normalResult = service.shouldFilterMessage(
        text: 'Привет всем в чате!',
        senderUsername: 'viewer42',
      );
      expect(normalResult.isBlocked, isFalse);
    });

    test('External links and invite URLs are blocked when filterLinks is enabled', () {
      final service = ChatterinoSpamFilterService();

      final linkResult = service.shouldFilterMessage(
        text: 'Переходите по ссылке https://free-skins-scam.ru за халявой',
        senderUsername: 'spammer',
      );
      expect(linkResult.isBlocked, isTrue);
      expect(linkResult.blockReason, contains('ссылка'));

      final wwwResult = service.shouldFilterMessage(
        text: 'Чекните сайт www.external-site.com',
        senderUsername: 'spammer',
      );
      expect(wwwResult.isBlocked, isTrue);
    });

    test('Blacklist words trigger filtering and can be managed', () {
      final service = ChatterinoSpamFilterService();

      // Дефолтное слово из черного списка
      final tgResult = service.shouldFilterMessage(
        text: 'Подпишись на телегу t.me/mychannel',
        senderUsername: 'ad_bot',
      );
      expect(tgResult.isBlocked, isTrue);

      // Добавление кастомного слова
      service.addBlacklistWord('спойлер_босса');
      final customResult = service.shouldFilterMessage(
        text: 'В конце игры будет спойлер_босса!',
        senderUsername: 'troll',
      );
      expect(customResult.isBlocked, isTrue);
      expect(customResult.blockReason, contains('спойлер_босса'));

      // Удаление слова
      service.removeBlacklistWord('спойлер_босса');
      final afterRemove = service.shouldFilterMessage(
        text: 'В конце игры будет спойлер_босса!',
        senderUsername: 'troll',
      );
      expect(afterRemove.isBlocked, isFalse);
    });

    test('Copypasta deduplication blocks mass identical messages', () {
      final service = ChatterinoSpamFilterService();
      const copypastaText = 'ПАСТА ПАСТА ПАСТА СПАМ СПАМ СПАМ СПАМ';

      // 1-й раз -> разрешено
      final r1 = service.shouldFilterMessage(text: copypastaText, senderUsername: 'user1');
      expect(r1.isBlocked, isFalse);

      // 2-й раз -> разрешено
      final r2 = service.shouldFilterMessage(text: copypastaText, senderUsername: 'user2');
      expect(r2.isBlocked, isFalse);

      // 3-й раз -> заблокировано как копипаста
      final r3 = service.shouldFilterMessage(text: copypastaText, senderUsername: 'user3');
      expect(r3.isBlocked, isTrue);
      expect(r3.blockReason, contains('Копипаста'));
    });

    test('generateCssHidingRules generates CSS selectors for all known bots', () {
      final service = ChatterinoSpamFilterService();
      final css = service.generateCssHidingRules();

      expect(css, contains('.cpx-message[data-sender="nightbot"] { display: none !important; }'));
      expect(css, contains('.cpx-message[data-sender="streamelements"] { display: none !important; }'));
    });
  });
}
