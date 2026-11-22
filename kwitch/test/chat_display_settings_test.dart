import 'package:flutter_test/flutter_test.dart';
import '../lib/features/chat/domain/models/chat_display_settings.dart';

void main() {
  group('Chat Display Settings Tests (Chatterino+ Customization)', () {
    test('setFontSize updates within valid range [11.0, 18.0]', () {
      final settings = ChatDisplaySettings();
      expect(settings.fontSize, equals(13.0));

      settings.setFontSize(16.0);
      expect(settings.fontSize, equals(16.0));

      // Проверка ограничения
      settings.setFontSize(25.0);
      expect(settings.fontSize, equals(18.0));

      settings.setFontSize(5.0);
      expect(settings.fontSize, equals(11.0));
    });

    test('toCssOverrides outputs valid runtime CSS overrides', () {
      final settings = ChatDisplaySettings();
      settings.setFontSize(15.0);
      settings.toggleTimestamps(false);

      final css = settings.toCssOverrides();
      expect(css, contains('--cpx-chat-font-size: 15.0px;'));
      expect(css, contains('.chat-time { display: none; }'));
    });

    test('setActiveMirror switches between ws.chat.eblo.id and ws.rish098.xyz', () {
      final settings = ChatDisplaySettings();
      expect(settings.activeMirror, equals('https://ws.chat.eblo.id'));

      settings.setActiveMirror('https://ws.rish098.xyz');
      expect(settings.activeMirror, equals('https://ws.rish098.xyz'));
    });
  });
}
