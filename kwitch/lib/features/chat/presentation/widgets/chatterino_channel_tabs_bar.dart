import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/models/chat_channel_tab.dart';
import '../../domain/services/chatterino_multi_chat_service.dart';

class ChatterinoChannelTabsBar extends StatelessWidget {
  final ChatterinoMultiChatService multiChatService;

  const ChatterinoChannelTabsBar({
    super.key,
    required this.multiChatService,
  });

  void _showAddChannelDialog(BuildContext context) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: KColors.panel,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: KColors.accBorder, width: 1),
        ),
        title: Text(
          'Добавить чат канала',
          style: KTypography.titleBold.copyWith(fontSize: 16),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Введите логин стримера на Twitch:',
              style: KTypography.caption.copyWith(color: KColors.muted),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: controller,
              autofocus: true,
              style: KTypography.body.copyWith(color: KColors.ink),
              decoration: InputDecoration(
                hintText: 'например: bratishkinoff, nix...',
                hintStyle: KTypography.body.copyWith(color: KColors.faint),
                filled: true,
                fillColor: KColors.well,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: KColors.panelBorder),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: KColors.lav),
                ),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Отмена', style: KTypography.caption.copyWith(color: KColors.muted)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: KColors.accBorder,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () {
              final name = controller.text.trim();
              if (name.isNotEmpty) {
                final success = multiChatService.addChannel(name);
                Navigator.pop(ctx);
                if (!success) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      backgroundColor: KColors.panel,
                      content: Text(
                        'Достигнут максимум вкладок (${ChatterinoMultiChatService.maxTabs})',
                        style: KTypography.caption.copyWith(color: KColors.ink),
                      ),
                    ),
                  );
                }
              }
            },
            child: Text(
              'Открыть вкладку',
              style: KTypography.caption.copyWith(color: KColors.ink, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 38,
      decoration: const BoxDecoration(
        color: Color(0xFF0C0C0F),
        border: Border(
          bottom: BorderSide(color: KColors.panelBorder, width: 0.8),
        ),
      ),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        itemCount: multiChatService.tabs.length + 1,
        itemBuilder: (context, index) {
          if (index == multiChatService.tabs.length) {
            // Кнопка добавления новой вкладки
            return GestureDetector(
              onTap: () {
                HapticFeedback.lightImpact();
                _showAddChannelDialog(context);
              },
              child: Container(
                margin: const EdgeInsets.only(left: 6),
                padding: const EdgeInsets.symmetric(horizontal: 10),
                decoration: BoxDecoration(
                  color: KColors.well,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: KColors.panelBorder, width: 0.8),
                ),
                child: const Center(
                  child: Icon(LucideIcons.plus, size: 14, color: KColors.lav),
                ),
              ),
            );
          }

          final tab = multiChatService.tabs[index];
          final isActive = tab.channelId == multiChatService.activeChannelId;

          return GestureDetector(
            onTap: () {
              HapticFeedback.selectionClick();
              multiChatService.switchChannel(tab.channelId);
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.only(right: 6),
              padding: const EdgeInsets.symmetric(horizontal: 10),
              decoration: BoxDecoration(
                color: isActive ? KColors.accBg : KColors.panel,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: isActive ? KColors.accBorder : KColors.panelBorder,
                  width: 1,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '#',
                    style: KTypography.monoStats.copyWith(
                      color: isActive ? KColors.lav : KColors.faint,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    tab.displayName,
                    style: KTypography.caption.copyWith(
                      color: isActive ? KColors.lavInk : KColors.muted,
                      fontWeight: isActive ? FontWeight.bold : FontWeight.w500,
                      fontSize: 12,
                    ),
                  ),
                  // Бейдж непрочитанных сообщений
                  if (tab.unreadCount > 0) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(
                        color: tab.hasMention ? KColors.redBg : KColors.accBorder,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '${tab.unreadCount}',
                        style: KTypography.monoStats.copyWith(
                          fontSize: 9,
                          color: tab.hasMention ? KColors.redInk : Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                  // Кнопка закрытия вкладки (кроме основного стрима)
                  if (!tab.isPrimary) ...[
                    const SizedBox(width: 6),
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.lightImpact();
                        multiChatService.closeChannel(tab.channelId);
                      },
                      child: const Icon(
                        LucideIcons.x,
                        size: 13,
                        color: KColors.faint,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
