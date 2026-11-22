import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Действия для настройки кликов кнопок гарнитуры
enum HeadsetMultiClickAction {
  nextChannel,
  jumpToLive,
  instantReplay30s,
  toggleAudioOnly,
  toggleMute,
}

/// Сервис перехвата и обработки аппаратных медиа-кнопок проводных и Bluetooth-гарнитур,
/// кнопок умных часов и виджетов экрана блокировки Android (MediaButtons Receiver).
class MediaButtonsService extends ChangeNotifier {
  static const MethodChannel _channel = MethodChannel('cc.kipsway.kwitch/media_buttons');

  bool _isEnabled = true;
  HeadsetMultiClickAction _doubleClickAction = HeadsetMultiClickAction.jumpToLive;
  HeadsetMultiClickAction _tripleClickAction = HeadsetMultiClickAction.instantReplay30s;

  // Детектор одиночных, двойных и тройных кликов кнопки гарнитуры (Headset Hook)
  int _clickCount = 0;
  Timer? _clickDebounceTimer;
  static const Duration _clickTimeout = Duration(milliseconds: 380);

  // Последнее зарегистрированное событие для тестера в UI
  String _lastEventName = 'Ожидание нажатия...';
  DateTime? _lastEventTime;

  // Колбэки действий плеера
  VoidCallback? onPlayPause;
  VoidCallback? onNextChannel;
  VoidCallback? onPreviousChannel;
  VoidCallback? onJumpToLive;
  VoidCallback? onInstantReplay;
  VoidCallback? onToggleAudioOnly;
  VoidCallback? onToggleMute;

  bool get isEnabled => _isEnabled;
  HeadsetMultiClickAction get doubleClickAction => _doubleClickAction;
  HeadsetMultiClickAction get tripleClickAction => _tripleClickAction;
  String get lastEventName => _lastEventName;
  DateTime? get lastEventTime => _lastEventTime;

  MediaButtonsService() {
    _channel.setMethodCallHandler(_handleNativeMediaButton);
  }

  Future<dynamic> _handleNativeMediaButton(MethodCall call) async {
    if (!_isEnabled) return;

    switch (call.method) {
      case 'onMediaPlayPause':
        handleHeadsetClick();
        break;
      case 'onMediaNext':
        handleAction(HeadsetMultiClickAction.nextChannel);
        break;
      case 'onMediaPrevious':
        handleAction(HeadsetMultiClickAction.instantReplay30s);
        break;
      case 'onMediaStop':
        onPlayPause?.call();
        _recordEvent('Stop / Pause');
        break;
      case 'onMediaFastForward':
        onJumpToLive?.call();
        _recordEvent('FastForward -> Прямой эфир');
        break;
      case 'onMediaRewind':
        onInstantReplay?.call();
        _recordEvent('Rewind -> Повтор 30с');
        break;
    }
  }

  /// Обработка клика основной кнопки гарнитуры (Hook / Pause)
  void handleHeadsetClick() {
    _clickCount++;
    _clickDebounceTimer?.cancel();

    _clickDebounceTimer = Timer(_clickTimeout, () {
      if (_clickCount == 1) {
        onPlayPause?.call();
        _recordEvent('Одинарный клик: Play / Pause');
      } else if (_clickCount == 2) {
        handleAction(_doubleClickAction);
        _recordEvent('Двойной клик: ${_actionTitle(_doubleClickAction)}');
      } else if (_clickCount >= 3) {
        handleAction(_tripleClickAction);
        _recordEvent('Тройной клик: ${_actionTitle(_tripleClickAction)}');
      }
      _clickCount = 0;
    });
  }

  /// Выполнение настроенного действия
  void handleAction(HeadsetMultiClickAction action) {
    switch (action) {
      case HeadsetMultiClickAction.nextChannel:
        onNextChannel?.call();
        break;
      case HeadsetMultiClickAction.jumpToLive:
        onJumpToLive?.call();
        break;
      case HeadsetMultiClickAction.instantReplay30s:
        onInstantReplay?.call();
        break;
      case HeadsetMultiClickAction.toggleAudioOnly:
        onToggleAudioOnly?.call();
        break;
      case HeadsetMultiClickAction.toggleMute:
        onToggleMute?.call();
        break;
    }
  }

  void _recordEvent(String eventName) {
    _lastEventName = eventName;
    _lastEventTime = DateTime.now();
    notifyListeners();
  }

  /// Включение / отключение обработки медиа-кнопок
  void toggleEnabled([bool? val]) {
    final newState = val ?? !_isEnabled;
    if (_isEnabled == newState) return;
    _isEnabled = newState;
    notifyListeners();
  }

  /// Настройка действия двойного клика
  void setDoubleClickAction(HeadsetMultiClickAction action) {
    if (_doubleClickAction == action) return;
    _doubleClickAction = action;
    notifyListeners();
  }

  /// Настройка действия тройного клика
  void setTripleClickAction(HeadsetMultiClickAction action) {
    if (_tripleClickAction == action) return;
    _tripleClickAction = action;
    notifyListeners();
  }

  String _actionTitle(HeadsetMultiClickAction action) {
    switch (action) {
      case HeadsetMultiClickAction.nextChannel:
        return 'Следующий стример';
      case HeadsetMultiClickAction.jumpToLive:
        return 'Догон прямого эфира';
      case HeadsetMultiClickAction.instantReplay30s:
        return 'Мгновенный повтор 30с';
      case HeadsetMultiClickAction.toggleAudioOnly:
        return 'Режим «Только радио»';
      case HeadsetMultiClickAction.toggleMute:
        return 'Заглушить звук Mute';
    }
  }

  @override
  void dispose() {
    _clickDebounceTimer?.cancel();
    super.dispose();
  }
}
