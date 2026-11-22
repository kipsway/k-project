import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Сервис фонового воспроизведения и режима «Картинка в картинке» (PiP)
class PipBackgroundService extends ChangeNotifier {
  static const MethodChannel _channel = MethodChannel('cc.kipsway.kwitch/pip_audio');

  bool _isPipActive = false;
  bool _isBackgroundAudioEnabled = true;
  bool _isPlaying = true;

  bool get isPipActive => _isPipActive;
  bool get isBackgroundAudioEnabled => _isBackgroundAudioEnabled;
  bool get isPlaying => _isPlaying;

  PipBackgroundService() {
    _channel.setMethodCallHandler(_handleNativeCall);
  }

  Future<dynamic> _handleNativeCall(MethodCall call) async {
    switch (call.method) {
      case 'onPipModeChanged':
        _isPipActive = call.arguments as bool? ?? false;
        notifyListeners();
        break;
      case 'onPlayPauseAction':
        _isPlaying = !_isPlaying;
        notifyListeners();
        break;
      case 'onCatchUpLiveAction':
        // Синхронизация прямого эфира из шторки
        notifyListeners();
        break;
    }
  }

  /// Вход в нативный Android режим "Картинка в картинке" (16:9)
  Future<bool> enterPictureInPicture({
    int width = 16,
    int height = 9,
  }) async {
    try {
      final bool success = await _channel.invokeMethod('enterPip', {
        'aspectRatioNumerator': width,
        'aspectRatioDenominator': height,
      }) ?? false;
      _isPipActive = success;
      notifyListeners();
      return success;
    } on MissingPluginException {
      // Для сред без нативной платформы (fallback эмуляция)
      _isPipActive = true;
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Переключение фонового звука (при выключенном экране)
  void setBackgroundAudio(bool enabled) {
    _isBackgroundAudioEnabled = enabled;
    notifyListeners();
    try {
      _channel.invokeMethod('setBackgroundAudio', {'enabled': enabled});
    } catch (_) {}
  }

  /// Обновление медиа-уведомления в шторке
  Future<void> updateNotification({
    required String streamerName,
    required String categoryName,
    required bool isLive,
    required bool isTunnelEnabled,
  }) async {
    try {
      await _channel.invokeMethod('updateMediaNotification', {
        'title': streamerName,
        'subtitle': categoryName,
        'isLive': isLive,
        'tunnelActive': isTunnelEnabled,
        'isPlaying': _isPlaying,
      });
    } catch (_) {}
  }
}
