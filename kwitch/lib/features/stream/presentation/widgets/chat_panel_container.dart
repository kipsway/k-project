import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_typography.dart';
import '../../../chat/domain/models/chat_display_settings.dart';
import '../../../chat/domain/models/chat_user_profile.dart';
import '../../../chat/domain/services/chat_translate_service.dart';
import '../../../chat/domain/services/chatterino_multi_chat_service.dart';
import '../../../chat/domain/services/emote_cache_manager.dart';
import '../../../chat/domain/services/twitch_auth_service.dart';
import '../../../chat/domain/services/twitch_prediction_service.dart';
import '../../../chat/presentation/controllers/chatterino_controller.dart';
import '../../../chat/presentation/widgets/chat_settings_sheet.dart';
import '../../../chat/presentation/widgets/chat_translate_sheet.dart';
import '../../../chat/presentation/widgets/chatterino_channel_tabs_bar.dart';
import '../../../chat/presentation/widgets/chatterino_emotes_sheet.dart';
import '../../../chat/presentation/widgets/chatterino_webview.dart';
import '../../../chat/presentation/widgets/prediction_poll_banner.dart';
import '../../../chat/presentation/widgets/twitch_auth_sheet.dart';
import '../../../chat/presentation/widgets/user_card_sheet.dart';
import 'chat_input_bar.dart';

class ChatPanelContainer extends StatefulWidget {
  final String channelName;
  final VoidCallback onOpenEmotes;
  final ValueChanged<String> onSendMessage;

  const ChatPanelContainer({
    super.key,
    required this.channelName,
    required this.onOpenEmotes,
    required this.onSendMessage,
  });

  @override
  State<ChatPanelContainer> createState() => _ChatPanelContainerState();
}

class _ChatPanelContainerState extends State<ChatPanelContainer> {
  late final ChatterinoController _chatterinoController;
  late final EmoteCacheManager _cacheManager;
  late final ChatDisplaySettings _displaySettings;
  late final ChatterinoMultiChatService _multiChatService;
  late final ChatTranslateService _translateService;
  late final TwitchAuthService _authService;
  late final TwitchPredictionService _predictionService;
  bool _useWebViewEngine = true;

  @override
  void initState() {
    super.initState();
    _chatterinoController = ChatterinoController(channel: widget.channelName);
    _cacheManager = EmoteCacheManager()..preloadDefaultEmotes();
    _displaySettings = ChatDisplaySettings()..addListener(_onDisplaySettingsChanged);
    _multiChatService = ChatterinoMultiChatService(initialChannel: widget.channelName)
      ..addListener(_onMultiChatChanged);
    _translateService = ChatTranslateService()..addListener(_onTranslateSettingsChanged);
    _authService = TwitchAuthService()..addListener(_onAuthStateChanged);
    _predictionService = TwitchPredictionService();
  }

  @override
  void didUpdateWidget(ChatPanelContainer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.channelName != widget.channelName) {
      _multiChatService.setPrimaryChannel(widget.channelName);
      _chatterinoController.setChannel(widget.channelName);
    }
  }

  void _onMultiChatChanged() {
    if (mounted) {
      if (_chatterinoController.channel != _multiChatService.activeChannelId) {
        _chatterinoController.setChannel(_multiChatService.activeChannelId);
      }
      setState(() {});
    }
  }

  void _onDisplaySettingsChanged() {
    if (mounted) {
      setState(() {});
      // Динамическая инжекция CSS в WebView
      _chatterinoController.webViewController?.runJavaScript('''
        (function() {
          let styleEl = document.getElementById('cpx-runtime-overrides');
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'cpx-runtime-overrides';
            document.head.appendChild(styleEl);
          }
          styleEl.textContent = `${_displaySettings.toCssOverrides()}`;
        })();
      ''');
    }
  }

  void _onTranslateSettingsChanged() {
    if (mounted) {
      setState(() {});
      _chatterinoController.webViewController?.runJavaScript(
        _translateService.generateInlineTranslationJs(),
      );
    }
  }

  void _onAuthStateChanged() {
    if (mounted) {
      setState(() {});
      _chatterinoController.webViewController?.runJavaScript(
        _authService.generateChatterinoAuthScript(),
      );
    }
  }

  void _openTwitchAuth() {
    TwitchAuthSheet.show(context, _authService);
  }

  @override
  void dispose() {
    _chatterinoController.dispose();
    _cacheManager.dispose();
    _displaySettings.removeListener(_onDisplaySettingsChanged);
    _displaySettings.dispose();
    _multiChatService.removeListener(_onMultiChatChanged);
    _multiChatService.dispose();
    _translateService.removeListener(_onTranslateSettingsChanged);
    _translateService.dispose();
    _authService.removeListener(_onAuthStateChanged);
    _authService.dispose();
    _predictionService.dispose();
    super.dispose();
  }

  void _openEmotesModal() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) {
        return ChatterinoEmotesSheet(
          channel: _multiChatService.activeChannelId,
          cacheManager: _cacheManager,
          onSelectEmote: (emote) {
            _chatterinoController.insertEmote(emote);
          },
        );
      },
    );
  }

  void _openChatSettings() {
    ChatSettingsSheet.show(context, _displaySettings);
  }

  void _openChatTranslate() {
    ChatTranslateSheet.show(context, _translateService);
  }

  void _openUserCard(String username) {
    final profile = ChatUserProfile(
      username: username.toLowerCase(),
      displayName: username,
      userColor: username == 'kipsway'
          ? KColors.lav
          : (username.contains('Rish') ? KColors.green : const Color(0xFF539BF5)),
      hasNamePaint: username == 'kipsway' || username.contains('Rish'),
      paintColors: username == 'kipsway'
          ? [KColors.lav, const Color(0xFFD9CFFD), const Color(0xFF7E6FC4)]
          : (username.contains('Rish') ? [KColors.green, KColors.greenInk] : null),
      badges: username == 'kipsway'
          ? ['dev', 'mod', 'sub']
          : (username.contains('Rish') ? ['7tv', 'dev'] : ['vip']),
      isSubscribed: true,
      monthsSubscribed: 14,
      recentMessages: [
        'Битрейт 1440p теперь идет чисто через k-Tunnel 🚀',
        'Движок Chatterino+ и EventAPI активны!',
      ],
    );

    UserCardSheet.show(
      context,
      user: profile,
      onModAction: (action) {
        final cmd = profile.getIrcCommand(action);
        _handleSendMessage(cmd);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: KColors.panel,
            duration: const Duration(seconds: 2),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(color: KColors.accBorder, width: 1),
            ),
            content: Text(
              'Действие модератора выполнено: $cmd',
              style: KTypography.caption.copyWith(color: KColors.ink),
            ),
          ),
        );
      },
    );
  }

  void _handleSendMessage(String text) {
    widget.onSendMessage(text);
    _chatterinoController.sendMessage(text);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: KColors.bg,
      child: Column(
        children: [
          // ШАПКА ЧАТА (Chatterino+ Header)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: const BoxDecoration(
              color: KColors.panel,
              border: Border(
                bottom: BorderSide(color: KColors.panelBorder, width: 1.0),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Text('Чат', style: KTypography.sectionHeader),
                    const SizedBox(width: 8),
                    // Бейдж Chatterino+ со статусом зеркал и кэша
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: KColors.accBg,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: KColors.accBorder, width: 0.8),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: const BoxDecoration(
                              color: KColors.lav,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 5),
                          Text(
                            'Chatterino+ by Rish',
                            style: KTypography.caption.copyWith(
                              fontSize: 10,
                              color: KColors.lavInk,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    // Кнопка авторизации Twitch / Профиль
                    IconButton(
                      onPressed: _openTwitchAuth,
                      icon: Icon(
                        _authService.isAuthenticated ? LucideIcons.userCheck : LucideIcons.user,
                        size: 17,
                        color: _authService.isAuthenticated ? KColors.lav : KColors.muted,
                      ),
                      tooltip: _authService.isAuthenticated
                          ? '@${_authService.currentUsername}'
                          : 'Вход в аккаунт Twitch',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                    const SizedBox(width: 12),
                    // Кнопка инлайн-переводчика чата
                    IconButton(
                      onPressed: _openChatTranslate,
                      icon: Icon(
                        LucideIcons.languages,
                        size: 17,
                        color: _translateService.isEnabled ? KColors.lav : KColors.muted,
                      ),
                      tooltip: 'Инлайн-переводчик чата',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                    const SizedBox(width: 12),
                    // Кнопка настроек чата
                    IconButton(
                      onPressed: _openChatSettings,
                      icon: const Icon(LucideIcons.sliders, size: 17, color: KColors.muted),
                      tooltip: 'Настройки чата',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                    const SizedBox(width: 12),
                    // Переключатель режима движка (WebView / Native)
                    IconButton(
                      onPressed: () {
                        HapticFeedback.selectionClick();
                        setState(() => _useWebViewEngine = !_useWebViewEngine);
                      },
                      icon: Icon(
                        _useWebViewEngine ? LucideIcons.globe : LucideIcons.layers,
                        size: 18,
                        color: _useWebViewEngine ? KColors.lav : KColors.muted,
                      ),
                      tooltip: _useWebViewEngine ? 'Движок WebView' : 'Нативный режим',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                    const SizedBox(width: 12),
                    // Пауза чата
                    IconButton(
                      onPressed: () {
                        HapticFeedback.lightImpact();
                        _chatterinoController.setPaused(!_chatterinoController.isPaused);
                        setState(() {});
                      },
                      icon: Icon(
                        _chatterinoController.isPaused ? LucideIcons.play : LucideIcons.pause,
                        size: 18,
                        color: _chatterinoController.isPaused ? KColors.yellow : KColors.muted,
                      ),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                    const SizedBox(width: 12),
                    // Кнопка Смайлы
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.selectionClick();
                        _openEmotesModal();
                      },
                      child: Row(
                        children: [
                          const Icon(LucideIcons.smile, size: 18, color: KColors.lav),
                          const SizedBox(width: 4),
                          Text(
                            'Смайлы',
                            style: KTypography.caption.copyWith(
                              color: KColors.lavInk,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // ВКЛАДКИ МУЛЬТИ-ЧАТА КАНАЛОВ (Multi-Chat Split Tabs)
          ChatterinoChannelTabsBar(multiChatService: _multiChatService),

          // БАННЕР СТАВОК И ОПРОСОВ TWITCH PREDICTIONS & POLLS
          PredictionPollBanner(service: _predictionService),

          // ИНДИКАТОР ПАУЗЫ ЧАТА
          if (_chatterinoController.isPaused)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 4),
              color: KColors.yellow.withOpacity(0.15),
              child: Center(
                child: Text(
                  'Чат приостановлен (нажмите play для синхронизации)',
                  style: KTypography.caption.copyWith(
                    color: KColors.yellow,
                    fontSize: 11,
                  ),
                ),
              ),
            ),

          // ОСНОВНАЯ ОБЛАСТЬ ЧАТА (Chatterino+ WebView)
          Expanded(
            child: _useWebViewEngine
                ? ChatterinoWebView(
                    channel: widget.channelName,
                    controller: _chatterinoController,
                    onEmoteClicked: (emote) {
                      _chatterinoController.insertEmote(emote);
                    },
                  )
                : Container(
                    color: KColors.bg,
                    child: Center(
                      child: TextButton(
                        onPressed: () => _openUserCard('kipsway'),
                        child: Text(
                          'Нажмите для проверки карточки модерации @kipsway',
                          style: KTypography.caption.copyWith(color: KColors.lav),
                        ),
                      ),
                    ),
                  ),
          ),

          // НИЖНИЙ ИНПУТ-БАР
          ChatInputBar(
            onSendMessage: _handleSendMessage,
            onOpenEmotes: _openEmotesModal,
          ),
        ],
      ),
    );
  }
}
