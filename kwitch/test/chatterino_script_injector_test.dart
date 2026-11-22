import 'package:flutter_test/flutter_test.dart';
import '../lib/features/chat/data/chatterino_script_injector.dart';

void main() {
  group('Chatterino+ Script Injector Tests (Rish / chat.eblo.id)', () {
    test('buildBridgeScript injects cpx-own class and Mosaic CSS tokens', () {
      final script = ChatterinoScriptInjector.buildBridgeScript(
        channel: 'buda',
        darkTheme: true,
      );

      expect(script, contains("document.documentElement.classList.add('cpx-own')"));
      expect(script, contains("setProperty('--cpx-bg', '#0a0a0c')"));
      expect(script, contains("setProperty('--cpx-lav', '#b8a7f0')"));
      expect(script, contains("window.__kWitchSendMessage"));
      expect(script, contains("window.FlutterBridge"));
    });

    test('buildStandaloneChatHtml includes Rish mirrors ws.chat.eblo.id and ws.rish098.xyz', () {
      final html = ChatterinoScriptInjector.buildStandaloneChatHtml(
        channel: 'buda',
        customCss: '.custom-rule { color: #fff; }',
      );

      expect(html, contains('https://ws.chat.eblo.id'));
      expect(html, contains('https://ws.rish098.xyz'));
      expect(html, contains('<html lang="ru" class="cpx-own">'));
      expect(html, contains('.custom-rule { color: #fff; }'));
    });
  });
}
