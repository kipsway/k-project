import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import '../lib/features/chat/domain/services/chatterino_highlight_service.dart';

void main() {
  group('ChatterinoHighlightService & Rules Tests', () {
    test('Default rules are initialized with self-mention, broadcaster, and mod rules', () {
      final service = ChatterinoHighlightService(defaultUsername: 'kipsway');
      expect(service.rules.length, greaterThanOrEqualTo(4));

      final selfRule = service.rules.firstWhere((r) => r.isSelfMention);
      expect(selfRule.pattern, equals('kipsway'));
      expect(selfRule.label, contains('kipsway'));
      expect(selfRule.playSound, isTrue);
      expect(selfRule.isEnabled, isTrue);
    });

    test('checkMessage accurately triggers self-mention on @username or username', () {
      final service = ChatterinoHighlightService(defaultUsername: 'kipsway');

      // Сообщение с тегом
      final match1 = service.checkMessage(
        text: 'Привет @kipsway как дела на стриме?',
        senderUsername: 'viewer123',
      );
      expect(match1, isNotNull);
      expect(match1!.rule.isSelfMention, isTrue);
      expect(match1.matchedText, equals('@kipsway'));
      expect(match1.playSound, isTrue);

      // Сообщение без упоминания
      final match2 = service.checkMessage(
        text: 'Просто обычный комментарий в чате',
        senderUsername: 'viewer123',
      );
      expect(match2, isNull);
    });

    test('checkMessage highlights broadcaster and moderator messages', () {
      final service = ChatterinoHighlightService(defaultUsername: 'kipsway');

      // Сообщение стримера
      final streamMatch = service.checkMessage(
        text: 'Всем спасибо за подписки!',
        senderUsername: 'buda',
        isBroadcaster: true,
      );
      expect(streamMatch, isNotNull);
      expect(streamMatch!.rule.id, equals('rule_streamer'));
      expect(streamMatch.matchedText, equals('Стример'));

      // Сообщение модератора
      final modMatch = service.checkMessage(
        text: 'Без спама в чате, пожалуйста',
        senderUsername: 'mod_alex',
        isMod: true,
      );
      expect(modMatch, isNotNull);
      expect(modMatch!.rule.id, equals('rule_moderator'));
      expect(modMatch.matchedText, equals('Модератор'));
    });

    test('Adding and toggling custom keyword rule works as expected', () {
      final service = ChatterinoHighlightService(defaultUsername: 'kipsway');

      service.addRule(
        pattern: '1440p',
        color: const Color(0xFF3B82F6),
        playSound: false,
      );

      expect(service.rules.any((r) => r.pattern == '1440p'), isTrue);

      final match = service.checkMessage(
        text: 'Этот стрим идет в 1440p через k-Tunnel',
        senderUsername: 'tech_fan',
      );
      expect(match, isNotNull);
      expect(match!.matchedText, equals('1440p'));
      expect(match.playSound, isFalse);

      // Отключаем правило
      final customRule = service.rules.firstWhere((r) => r.pattern == '1440p');
      service.toggleRule(customRule.id, false);

      final matchAfterDisable = service.checkMessage(
        text: 'Этот стрим идет в 1440p через k-Tunnel',
        senderUsername: 'tech_fan',
      );
      expect(matchAfterDisable, isNull);
    });

    test('setCurrentUsername updates self-mention rule pattern and label', () {
      final service = ChatterinoHighlightService(defaultUsername: 'kipsway');
      service.setCurrentUsername('rish');

      expect(service.currentUsername, equals('rish'));
      final selfRule = service.rules.firstWhere((r) => r.isSelfMention);
      expect(selfRule.pattern, equals('rish'));
      expect(selfRule.label, contains('rish'));

      final match = service.checkMessage(
        text: 'Привет @rish спасибо за Chatterino+',
        senderUsername: 'twitch_user',
      );
      expect(match, isNotNull);
      expect(match!.matchedText, equals('@rish'));
    });

    test('generateCssStyles generates valid CSS classes for enabled rules', () {
      final service = ChatterinoHighlightService(defaultUsername: 'kipsway');
      final css = service.generateCssStyles();

      expect(css, contains('.cpx-highlight-rule_self_mention'));
      expect(css, contains('border-left: 3px solid'));
      expect(css, contains('border-radius: 4px'));
    });
  });
}
