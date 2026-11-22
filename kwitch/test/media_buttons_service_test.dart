import 'package:flutter_test/flutter_test.dart';
import '../lib/features/stream/domain/services/media_buttons_service.dart';

void main() {
  group('MediaButtonsService Tests', () {
    test('Initial state is enabled with jumpToLive and instantReplay30s defaults', () {
      final service = MediaButtonsService();

      expect(service.isEnabled, isTrue);
      expect(service.doubleClickAction, equals(HeadsetMultiClickAction.jumpToLive));
      expect(service.tripleClickAction, equals(HeadsetMultiClickAction.instantReplay30s));
      expect(service.lastEventName, contains('Ожидание'));
      expect(service.lastEventTime, isNull);
    });

    test('Toggling enabled flips state and notifies listeners', () {
      final service = MediaButtonsService();
      bool notified = false;
      service.addListener(() => notified = true);

      service.toggleEnabled(false);
      expect(service.isEnabled, isFalse);
      expect(notified, isTrue);

      service.toggleEnabled(true);
      expect(service.isEnabled, isTrue);
    });

    test('Changing double and triple click actions updates settings', () {
      final service = MediaButtonsService();
      int notifyCount = 0;
      service.addListener(() => notifyCount++);

      service.setDoubleClickAction(HeadsetMultiClickAction.nextChannel);
      expect(service.doubleClickAction, equals(HeadsetMultiClickAction.nextChannel));

      service.setTripleClickAction(HeadsetMultiClickAction.toggleAudioOnly);
      expect(service.tripleClickAction, equals(HeadsetMultiClickAction.toggleAudioOnly));

      expect(notifyCount, equals(2));
    });

    test('handleAction dispatches corresponding callbacks accurately', () {
      final service = MediaButtonsService();

      bool jumpToLiveCalled = false;
      bool nextChannelCalled = false;
      bool replayCalled = false;
      bool audioOnlyCalled = false;
      bool muteCalled = false;

      service.onJumpToLive = () => jumpToLiveCalled = true;
      service.onNextChannel = () => nextChannelCalled = true;
      service.onInstantReplay = () => replayCalled = true;
      service.onToggleAudioOnly = () => audioOnlyCalled = true;
      service.onToggleMute = () => muteCalled = true;

      service.handleAction(HeadsetMultiClickAction.jumpToLive);
      expect(jumpToLiveCalled, isTrue);

      service.handleAction(HeadsetMultiClickAction.nextChannel);
      expect(nextChannelCalled, isTrue);

      service.handleAction(HeadsetMultiClickAction.instantReplay30s);
      expect(replayCalled, isTrue);

      service.handleAction(HeadsetMultiClickAction.toggleAudioOnly);
      expect(audioOnlyCalled, isTrue);

      service.handleAction(HeadsetMultiClickAction.toggleMute);
      expect(muteCalled, isTrue);
    });

    test('Single click on headset hook fires play/pause callback after debounce', () async {
      final service = MediaButtonsService();
      bool playPauseCalled = false;
      service.onPlayPause = () => playPauseCalled = true;

      service.handleHeadsetClick();

      // Ждем завершения таймера распознавания одиночного клика (380 мс)
      await Future.delayed(const Duration(milliseconds: 420));
      expect(playPauseCalled, isTrue);
      expect(service.lastEventName, contains('Play / Pause'));
      expect(service.lastEventTime, isNotNull);
    });

    test('Double click on headset hook executes configured double-click action', () async {
      final service = MediaButtonsService();
      bool jumpToLiveCalled = false;
      service.onJumpToLive = () => jumpToLiveCalled = true;
      service.setDoubleClickAction(HeadsetMultiClickAction.jumpToLive);

      service.handleHeadsetClick();
      service.handleHeadsetClick();

      await Future.delayed(const Duration(milliseconds: 420));
      expect(jumpToLiveCalled, isTrue);
      expect(service.lastEventName, contains('Двойной клик'));
    });

    test('Dispose cancels pending timers without errors', () {
      final service = MediaButtonsService();
      service.handleHeadsetClick();

      expect(() => service.dispose(), returnsNormally);
    });
  });
}
