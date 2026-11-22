import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_typography.dart';
import '../../../chat/domain/models/chat_user_profile.dart';
import '../../../chat/presentation/controllers/chatterino_controller.dart';
import '../../../chat/presentation/widgets/chatterino_emotes_sheet.dart';
import '../../../chat/presentation/widgets/chatterino_webview.dart';
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
  bool _useWebViewEngine = true;

  @override
  void initState() {
    super.initState();
    _chatterinoController = ChatterinoController(channel: widget.channelName);
  }

  @override
  void dispose() {
    _chatterinoController.dispose();
    super.dispose();
  }

  void _openEmotesModal() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) {
        return ChatterinoEmotesSheet(
          channel: widget.channelName,
          onSelectEmote: (emote) {
            _chatterinoController.insertEmote(emote);
          },
        );
      },
    );
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
                    // Бейдж Chatterino+ со статусом зеркал
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
                    const SizedBox(width: 14),
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
                    const SizedBox(width: 14),
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
