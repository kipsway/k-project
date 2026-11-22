import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../../chat/presentation/widgets/chatterino_emotes_sheet.dart';

class GlassChatOverlay extends StatefulWidget {
  final String channel;
  final bool isVisible;
  final VoidCallback onClose;
  final ValueChanged<String> onSendMessage;

  const GlassChatOverlay({
    super.key,
    required this.channel,
    required this.isVisible,
    required this.onClose,
    required this.onSendMessage,
  });

  @override
  State<GlassChatOverlay> createState() => _GlassChatOverlayState();
}

class _GlassChatOverlayState extends State<GlassChatOverlay> {
  // Позиционирование и геометрия плавающего оверлея
  double _overlayOpacity = 0.65; // Прозрачность стекла (65%)
  bool _isMinimized = false;
  double _overlayWidth = 320.0;
  double _overlayHeight = 380.0;
  Offset _position = const Offset(16, 60);

  final List<Map<String, dynamic>> _overlayMessages = [
    {
      'author': 'kipsway',
      'color': KColors.lav,
      'text': 'Чат-оверлей поверх 1440p стрима со стеклянным размытием!',
      'paint': true,
    },
    {
      'author': 'Rish',
      'color': KColors.green,
      'text': 'Chatterino+ и 7TV смайлы видны прямо на видео catJAM',
      'paint': true,
    },
    {
      'author': 'viewer_pro',
      'color': Color(0xFF539BF5),
      'text': 'Никаких черных полос по бокам, чистый кайф PogU',
    },
  ];

  final TextEditingController _textController = TextEditingController();

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  void _sendMessage() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;
    HapticFeedback.lightImpact();
    widget.onSendMessage(text);
    setState(() {
      _overlayMessages.add({
        'author': 'Вы',
        'color': KColors.lavInk,
        'text': text,
      });
    });
    _textController.clear();
  }

  void _openEmotesSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => ChatterinoEmotesSheet(
        channel: widget.channel,
        onSelectEmote: (emote) {
          _textController.text = '${_textController.text} $emote '.trimLeft();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isVisible) return const SizedBox.shrink();

    // Если свернуто в компактный парящий бейдж (Pill)
    if (_isMinimized) {
      return Positioned(
        left: _position.dx,
        top: _position.dy,
        child: GestureDetector(
          onPanUpdate: (details) {
            setState(() {
              _position += details.delta;
            });
          },
          onTap: () {
            HapticFeedback.selectionClick();
            setState(() => _isMinimized = false);
          },
          child: KGlassContainer.capsule(
            blurSigma: 24,
            backgroundColor: KColors.panel.withOpacity(_overlayOpacity),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(LucideIcons.messageSquare, size: 16, color: KColors.lav),
                const SizedBox(width: 6),
                Text('Чат', style: KTypography.chipLabel.copyWith(fontSize: 11)),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                  decoration: BoxDecoration(
                    color: KColors.accBg,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: KColors.accBorder, width: 0.8),
                  ),
                  child: Text(
                    '${_overlayMessages.length}',
                    style: KTypography.monoStats.copyWith(fontSize: 9),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    // Развернутая панель "Жидкого стекла"
    return Positioned(
      left: _position.dx,
      top: _position.dy,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
          child: Container(
            width: _overlayWidth,
            height: _overlayHeight,
            decoration: BoxDecoration(
              color: KColors.panel.withOpacity(_overlayOpacity),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: KColors.glassBorderTop,
                width: 1.2,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.4),
                  blurRadius: 20,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Column(
              children: [
                // ШАПКА ОВЕРЛЕЯ С ПЕРЕТАСКИВАНИЕМ (Drag Handle)
                GestureDetector(
                  onPanUpdate: (details) {
                    setState(() {
                      _position += details.delta;
                    });
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: KColors.panel.withOpacity(0.4),
                      border: const Border(
                        bottom: BorderSide(color: KColors.panelBorder, width: 0.8),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(LucideIcons.gripVertical, size: 16, color: KColors.faint),
                            const SizedBox(width: 6),
                            Text('Чат-оверлей', style: KTypography.sectionHeader.copyWith(fontSize: 13)),
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: KColors.accBg,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text('Стекло', style: KTypography.monoStats.copyWith(fontSize: 9)),
                            ),
                          ],
                        ),
                        Row(
                          children: [
                            // Кнопка сворачивания в пилюлю
                            IconButton(
                              onPressed: () {
                                HapticFeedback.selectionClick();
                                setState(() => _isMinimized = true);
                              },
                              icon: const Icon(LucideIcons.minimize2, size: 16, color: KColors.muted),
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(),
                            ),
                            const SizedBox(width: 10),
                            // Кнопка закрытия
                            IconButton(
                              onPressed: () {
                                HapticFeedback.lightImpact();
                                widget.onClose();
                              },
                              icon: const Icon(LucideIcons.x, size: 16, color: KColors.muted),
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),

                // ЛЕНТА СООБЩЕНИЙ ОВЕРЛЕЯ
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    itemCount: _overlayMessages.length,
                    itemBuilder: (context, index) {
                      final msg = _overlayMessages[index];
                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: RichText(
                          text: TextSpan(
                            children: [
                              TextSpan(
                                text: '${msg['author']}: ',
                                style: TextStyle(
                                  fontFamily: 'Montserrat',
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                  color: msg['color'] as Color,
                                ),
                              ),
                              TextSpan(
                                text: msg['text'] as String,
                                style: KTypography.body.copyWith(
                                  fontSize: 12,
                                  color: KColors.ink,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),

                // НИЖНИЙ МИНИ-ИНПУТ ОВЕРЛЕЯ
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: KColors.well.withOpacity(0.7),
                    border: const Border(
                      top: BorderSide(color: KColors.panelBorder, width: 0.8),
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Container(
                          height: 36,
                          decoration: BoxDecoration(
                            color: KColors.cellOff.withOpacity(0.8),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: KColors.wellBorder, width: 0.8),
                          ),
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          child: Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _textController,
                                  style: KTypography.body.copyWith(fontSize: 12),
                                  onSubmitted: (_) => _sendMessage(),
                                  decoration: InputDecoration(
                                    hintText: 'Быстрый ответ...',
                                    hintStyle: KTypography.bodyMuted.copyWith(fontSize: 11),
                                    border: InputBorder.none,
                                    isDense: true,
                                  ),
                                ),
                              ),
                              GestureDetector(
                                onTap: _openEmotesSheet,
                                child: const Icon(LucideIcons.smile, size: 18, color: KColors.lav),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      IconButton(
                        onPressed: _sendMessage,
                        icon: const Icon(LucideIcons.send, size: 16, color: KColors.lav),
                        padding: const EdgeInsets.all(8),
                        constraints: const BoxConstraints(),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
