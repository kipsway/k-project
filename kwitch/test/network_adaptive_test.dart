import 'package:flutter_test/flutter_test.dart';
import '../lib/features/ktunnel/domain/services/network_adaptive_controller.dart';

void main() {
  group('Network Adaptive Bitrate & Traffic Monitor Tests', () {
    test('Recommended quality chooses 1440p60 on Wi-Fi and 1080p60 on Cellular', () {
      final controller = NetworkAdaptiveController();

      // На Wi-Fi -> 1440p60 Source
      controller.setConnectionType(NetworkConnectionType.wifi);
      expect(controller.recommendedQuality, equals('1440p60'));

      // На мобильной сети -> 1080p60 (экономия)
      controller.setConnectionType(NetworkConnectionType.cellular);
      expect(controller.recommendedQuality, equals('1080p60'));

      // При форсировании -> 1440p60 даже на мобильной сети
      controller.toggleForceMaxQuality(true);
      expect(controller.recommendedQuality, equals('1440p60'));
    });

    test('formattedSessionTraffic formats MB and GB accurately', () {
      final controller = NetworkAdaptiveController();

      // 50 МБ
      controller.addTraffic(50 * 1024 * 1024);
      expect(controller.formattedSessionTraffic, contains('МБ'));

      // 1.5 ГБ
      controller.addTraffic(1500 * 1024 * 1024);
      expect(controller.formattedSessionTraffic, contains('ГБ'));
    });
  });
}
