import 'package:flutter/foundation.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../data/chatterino_script_injector.dart';

class ChatterinoController extends ChangeNotifier {
  String _channel;
  WebViewController? _webViewController;
  bool _isLoading = true;
  bool _isPaused = false;
  String? _errorMessage;

  ChatterinoController({required String channel}) : _channel = channel;

  String get channel => _channel;
  bool get isLoading => _isLoading;
  bool get isPaused => _isPaused;
  String? get errorMessage => _errorMessage;
  WebViewController? get webViewController => _webViewController;

  void setChannel(String newChannel) {
    if (_channel == newChannel || newChannel.trim().isEmpty) return;
    _channel = newChannel.trim();
    reload();
  }

  void attachWebViewController(WebViewController controller) {
    _webViewController = controller;
  }

  void setLoading(bool loading) {
    _isLoading = loading;
    notifyListeners();
  }

  void setPaused(bool paused) {
    _isPaused = paused;
    if (_webViewController != null) {
      _webViewController!.runJavaScript(
        "window.__kWitchSetPause && window.__kWitchSetPause($paused);",
      );
    }
    notifyListeners();
  }

  void setError(String? error) {
    _errorMessage = error;
    _isLoading = false;
    notifyListeners();
  }

  /// Отправка сообщения в чат через JS-мост
  Future<void> sendMessage(String message) async {
    if (_webViewController == null || message.trim().isEmpty) return;
    final escaped = message.replaceAll("'", "\\'").replaceAll('"', '\\"');
    await _webViewController!.runJavaScript(
      "window.__kWitchSendMessage && window.__kWitchSendMessage('$escaped');",
    );
  }

  /// Вставка смайла в инпут
  Future<void> insertEmote(String emoteName) async {
    if (_webViewController == null) return;
    await _webViewController!.runJavaScript(
      "window.__kWitchInsertEmote && window.__kWitchInsertEmote('$emoteName');",
    );
  }

  /// Перезагрузка чата
  void reload() {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();
    _webViewController?.reload();
  }
}
