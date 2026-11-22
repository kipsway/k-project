import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../data/chatterino_script_injector.dart';
import '../controllers/chatterino_controller.dart';

class ChatterinoWebView extends StatefulWidget {
  final String channel;
  final ChatterinoController controller;
  final ValueChanged<String>? onEmoteClicked;

  const ChatterinoWebView({
    super.key,
    required this.channel,
    required this.controller,
    this.onEmoteClicked,
  });

  @override
  State<ChatterinoWebView> createState() => _ChatterinoWebViewState();
}

class _ChatterinoWebViewState extends State<ChatterinoWebView> {
  late final WebViewController _webViewController;
  bool _isEngineReady = false;

  @override
  void initState() {
    super.initState();
    _initWebView();
  }

  void _initWebView() {
    final popoutUrl = Uri.parse(
      'https://www.twitch.tv/popout/${widget.channel}/chat?popout=',
    );

    _webViewController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(KColors.bg)
      ..addJavaScriptChannel(
        'FlutterBridge',
        onMessageReceived: (JavaScriptMessage message) {
          // Обработка клика по смайлику или событию чата
          try {
            if (message.message.contains('EMOTE_CLICK')) {
              // Передача выбранного смайлика в нативный колбэк
            }
          } catch (_) {}
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (String url) {
            widget.controller.setLoading(true);
          },
          onPageFinished: (String url) async {
            // Инжектируем стили Мозаики Chatterino+ и JS-мост
            await _injectChatterinoEngine();
            widget.controller.setLoading(false);
            if (mounted) {
              setState(() => _isEngineReady = true);
            }
          },
          onWebResourceError: (WebResourceError error) {
            widget.controller.setError('Ошибка загрузки чата: ${error.description}');
          },
        ),
      )
      ..loadRequest(popoutUrl);

    widget.controller.attachWebViewController(_webViewController);
  }

  Future<void> _injectChatterinoEngine() async {
    // Инжекция моста и стилей
    final script = ChatterinoScriptInjector.buildBridgeScript(
      channel: widget.channel,
      darkTheme: true,
    );
    await _webViewController.runJavaScript(script);
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // Основной WebView с чатом
        WebViewWidget(controller: _webViewController),

        // Индикатор загрузки в стиле "Жидкое стекло"
        if (widget.controller.isLoading)
          Center(
            child: KGlassContainer(
              borderRadius: 20,
              blurSigma: 16,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(
                    width: 28,
                    height: 28,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      valueColor: AlwaysStoppedAnimation<Color>(KColors.lav),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Запуск Chatterino+ by Rish...',
                    style: KTypography.caption.copyWith(color: KColors.lavInk),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'ws.chat.eblo.id • 7TV EventAPI',
                    style: KTypography.monoStats.copyWith(fontSize: 10),
                  ),
                ],
              ),
            ),
          ),

        // Окно ошибки при сбое подключения
        if (widget.controller.errorMessage != null)
          Center(
            child: KGlassContainer(
              borderRadius: 20,
              padding: const EdgeInsets.all(20),
              margin: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.cloud_off, size: 36, color: KColors.red),
                  const SizedBox(height: 8),
                  Text(
                    'Не удалось подключиться к чату',
                    style: KTypography.sectionHeader.copyWith(color: KColors.redInk),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    widget.controller.errorMessage!,
                    style: KTypography.caption,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => widget.controller.reload(),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: KColors.accBg,
                      foregroundColor: KColors.lav,
                      side: const BorderSide(color: KColors.accBorder),
                      shape: const StadiumBorder(),
                    ),
                    child: const Text('Повторить попытку'),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
