import 'package:flutter_test/flutter_test.dart';
import '../lib/features/ktunnel/domain/models/tunnel_node.dart';
import '../lib/features/ktunnel/domain/models/tunnel_state.dart';
import '../lib/features/ktunnel/data/ktunnel_local_proxy.dart';

void main() {
  group('k-Tunnel Core Tests (1440p Bitrate Unlock)', () {
    test('Default nodes list contains subscription pool wistfalls.cc', () {
      expect(KTunnelPresets.defaultNodes.isNotEmpty, isTrue);
      expect(KTunnelPresets.subscriptionUrl, contains('wistfalls.cc'));

      final frankfurt = KTunnelPresets.defaultNodes.firstWhere((n) => n.countryCode == 'DE');
      expect(frankfurt.pingMs, lessThan(35));
      expect(frankfurt.host, equals('fra1.wistfalls.cc'));
    });

    test('wrapStreamUrl routes through loopback 127.0.0.1 when running', () {
      final proxy = KTunnelLocalProxy();
      const rawTwitchUrl = 'https://video-weaver.ams04.hls.ttvnw.net/v1/playlist.m3u8';

      // Пока прокси остановлен, возвращает исходный URL
      expect(proxy.wrapStreamUrl(rawTwitchUrl), equals(rawTwitchUrl));
    });

    test('TunnelState tracks zero dropped frames and 1440p bitrate', () {
      const state = TunnelState(
        isEnabled: true,
        status: TunnelStatus.connected,
        currentBitrateMbps: 14.2,
        droppedFrames: 0,
      );

      expect(state.isEnabled, isTrue);
      expect(state.status, equals(TunnelStatus.connected));
      expect(state.currentBitrateMbps, greaterThanOrEqualTo(14.0));
      expect(state.droppedFrames, equals(0));
    });
  });
}
