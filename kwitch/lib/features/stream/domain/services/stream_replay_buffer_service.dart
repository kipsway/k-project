import 'package:flutter/foundation.dart';

/// Сервис кольцевого буфера мгновенного повтора (Instant 30s DVR Replay) в kWitch.
/// Позволяет мгновенно отмотать последние 30-60 секунд стрима, просмотреть
/// клатч или смешной момент в замедленном темпе (0.5x) или обычном (1.0x) без
/// прерывания фоновой записи живого эфира и вернуться в реальное время в один тап.
class StreamReplayBufferService extends ChangeNotifier {
  bool _isReplayActive = false;
  double _replayOffsetSeconds = 0.0;
  double _replayPlaybackSpeed = 1.0;
  final double maxBufferSeconds = 60.0;
  final double defaultReplayStep = 30.0;

  bool get isReplayActive => _isReplayActive;
  double get replayOffsetSeconds => _replayOffsetSeconds;
  double get replayPlaybackSpeed => _replayPlaybackSpeed;

  /// Запуск мгновенного повтора назад на [secondsBack] секунд (по умолчанию 30с)
  void startInstantReplay([double secondsBack = 30.0]) {
    _isReplayActive = true;
    _replayOffsetSeconds = secondsBack.clamp(5.0, maxBufferSeconds);
    _replayPlaybackSpeed = 1.0;
    notifyListeners();
  }

  /// Возврат к живому краю трансляции (Live Edge)
  void exitReplayAndJumpToLive() {
    if (!_isReplayActive) return;
    _isReplayActive = false;
    _replayOffsetSeconds = 0.0;
    _replayPlaybackSpeed = 1.0;
    notifyListeners();
  }

  /// Перемещение по буферу повтора на [deltaSeconds]
  void seekReplay(double deltaSeconds) {
    if (!_isReplayActive) return;
    _replayOffsetSeconds = (_replayOffsetSeconds - deltaSeconds).clamp(0.0, maxBufferSeconds);
    if (_replayOffsetSeconds <= 0.5) {
      exitReplayAndJumpToLive();
    } else {
      notifyListeners();
    }
  }

  /// Установка точной позиции в буфере повтора (от 0 до maxBufferSeconds)
  void setReplayOffset(double offset) {
    if (!_isReplayActive) _isReplayActive = true;
    _replayOffsetSeconds = offset.clamp(0.0, maxBufferSeconds);
    if (_replayOffsetSeconds <= 0.5) {
      exitReplayAndJumpToLive();
    } else {
      notifyListeners();
    }
  }

  /// Переключение замедленного воспроизведения (0.5x Slow-Mo) для клатчей
  void toggleSlowMotion() {
    if (!_isReplayActive) return;
    _replayPlaybackSpeed = _replayPlaybackSpeed == 0.5 ? 1.0 : 0.5;
    notifyListeners();
  }

  /// Форматированная метка времени относительно прямого эфира (например, "-0:30")
  String get formattedOffset {
    final int sec = _replayOffsetSeconds.round();
    final int m = sec ~/ 60;
    final int s = sec % 60;
    final sStr = s < 10 ? '0$s' : '$s';
    return '-$m:$sStr';
  }

  /// Генерация диапазона меток для клипа
  Map<String, dynamic> generateClipMarkers() {
    return {
      'durationSeconds': _replayOffsetSeconds,
      'createdAt': DateTime.now().toIso8601String(),
      'clipTitle': 'kWitch Replay Highlight (${formattedOffset})',
    };
  }
}
