import 'package:flutter/foundation.dart';

class ChatDisplaySettings extends ChangeNotifier {
  double _fontSize = 13.0;
  bool _showTimestamps = true;
  bool _enableNamePaints = true;
  bool _enableBadges = true;
  String _activeMirror = 'https://ws.chat.eblo.id';
  double _lineSpacing = 1.45;

  double get fontSize => _fontSize;
  bool get showTimestamps => _showTimestamps;
  bool get enableNamePaints => _enableNamePaints;
  bool get enableBadges => _enableBadges;
  String get activeMirror => _activeMirror;
  double get lineSpacing => _lineSpacing;

  void setFontSize(double size) {
    final clamped = size.clamp(11.0, 18.0);
    if (_fontSize != clamped) {
      _fontSize = clamped;
      notifyListeners();
    }
  }

  void toggleTimestamps(bool show) {
    if (_showTimestamps != show) {
      _showTimestamps = show;
      notifyListeners();
    }
  }

  void toggleNamePaints(bool enable) {
    if (_enableNamePaints != enable) {
      _enableNamePaints = enable;
      notifyListeners();
    }
  }

  void toggleBadges(bool enable) {
    if (_enableBadges != enable) {
      _enableBadges = enable;
      notifyListeners();
    }
  }

  void setActiveMirror(String mirrorUrl) {
    if (_activeMirror != mirrorUrl) {
      _activeMirror = mirrorUrl;
      notifyListeners();
    }
  }

  /// Генерация CSS-инжекции для динамического обновления стилей в WebView
  String toCssOverrides() {
    return '''
      :root {
        --cpx-chat-font-size: ${_fontSize}px;
        --cpx-line-spacing: $_lineSpacing;
      }
      .chat-time { display: ${_showTimestamps ? "inline" : "none"}; }
      .chat-badge { display: ${_enableBadges ? "inline-block" : "none"}; }
      .cpx-paint { 
        background-clip: ${_enableNamePaints ? "text" : "border-box"} !important;
        -webkit-background-clip: ${_enableNamePaints ? "text" : "border-box"} !important;
      }
    ''';
  }
}
