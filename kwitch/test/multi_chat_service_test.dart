import 'package:flutter_test/flutter_test.dart';
import '../lib/features/chat/domain/services/chatterino_multi_chat_service.dart';

void main() {
  group('ChatterinoMultiChatService Tests', () {
    test('Initial channel is created as primary tab', () {
      final service = ChatterinoMultiChatService(initialChannel: 'buda');
      expect(service.tabs.length, equals(1));
      expect(service.tabs.first.channelId, equals('buda'));
      expect(service.tabs.first.isPrimary, isTrue);
      expect(service.activeChannelId, equals('buda'));
    });

    test('Adding new channel opens tab and switches to it', () {
      final service = ChatterinoMultiChatService(initialChannel: 'buda');
      int notifyCount = 0;
      service.addListener(() => notifyCount++);

      final success = service.addChannel('bratishkinoff');
      expect(success, isTrue);
      expect(service.tabs.length, equals(2));
      expect(service.activeChannelId, equals('bratishkinoff'));
      expect(service.tabs[1].isPrimary, isFalse);
      expect(notifyCount, equals(1));
    });

    test('Adding duplicate channel simply switches to existing tab', () {
      final service = ChatterinoMultiChatService(initialChannel: 'buda');
      service.addChannel('bratishkinoff');
      expect(service.tabs.length, equals(2));

      // Добавляем снова buda -> не дублирует, а переключает
      final success = service.addChannel('buda');
      expect(success, isTrue);
      expect(service.tabs.length, equals(2));
      expect(service.activeChannelId, equals('buda'));
    });

    test('Maximum 5 tabs limit is enforced', () {
      final service = ChatterinoMultiChatService(initialChannel: 'buda');
      service.addChannel('ch1');
      service.addChannel('ch2');
      service.addChannel('ch3');
      service.addChannel('ch4'); // всего 5
      expect(service.tabs.length, equals(5));

      final success = service.addChannel('ch5'); // 6-я вкладка
      expect(success, isFalse);
      expect(service.tabs.length, equals(5));
    });

    test('Primary tab cannot be closed, but secondary tabs can', () {
      final service = ChatterinoMultiChatService(initialChannel: 'buda');
      service.addChannel('evelone192');

      // Попытка закрыть primary
      service.closeChannel('buda');
      expect(service.tabs.length, equals(2));

      // Закрываем вторичный
      service.closeChannel('evelone192');
      expect(service.tabs.length, equals(1));
      expect(service.activeChannelId, equals('buda'));
    });

    test('recordMessage increments unread and mention only for inactive tabs', () {
      final service = ChatterinoMultiChatService(initialChannel: 'buda');
      service.addChannel('nix'); // Активен nix

      // Сообщение в активный чат nix -> unread не растет
      service.recordMessage('nix');
      expect(service.tabs.firstWhere((t) => t.channelId == 'nix').unreadCount, equals(0));

      // Сообщение в фоновый чат buda
      service.recordMessage('buda', hasMention: true);
      final budaTab = service.tabs.firstWhere((t) => t.channelId == 'buda');
      expect(budaTab.unreadCount, equals(1));
      expect(budaTab.hasMention, isTrue);

      // Переключаемся на buda -> unread сбрасывается
      service.switchChannel('buda');
      final budaTabAfterSwitch = service.tabs.firstWhere((t) => t.channelId == 'buda');
      expect(budaTabAfterSwitch.unreadCount, equals(0));
      expect(budaTabAfterSwitch.hasMention, isFalse);
    });

    test('setPrimaryChannel updates the primary tab on stream switch', () {
      final service = ChatterinoMultiChatService(initialChannel: 'buda');
      service.setPrimaryChannel('stray228', displayName: 'Stray228');

      expect(service.tabs.first.channelId, equals('stray228'));
      expect(service.tabs.first.displayName, equals('Stray228'));
      expect(service.activeChannelId, equals('stray228'));
    });
  });
}
