import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/services/chatterino_spam_filter_service.dart';

class ChatterinoSpamFilterSheet extends StatelessWidget {
  final ChatterinoSpamFilterService filterService;

  const ChatterinoSpamFilterSheet({
    super.key,
    required this.filterService,
  });

  static void show(BuildContext context, ChatterinoSpamFilterService filterService) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => AnimatedBuilder(
        animation: filterService,
        builder: (context, _) => ChatterinoSpamFilterSheet(filterService: filterService),
      ),
    );
  }

  void _showAddWordDialog(BuildContext context) {
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
          'Заблокировать слово или фразу',
          style: KTypography.titleBold.copyWith(fontSize: 16),
        ),
        content: TextField(
          controller: controller,
          autofocus: true,
          style: KTypography.body.copyWith(color: KColors.ink),
          decoration: InputDecoration(
            hintText: 'например: казино, спойлер, t.me...',
            hintStyle: KTypography.body.copyWith(color: KColors.faint),
            filled: true,
            fillColor: KColors.well,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: KColors.panelBorder),
            ),
          ),
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
              final text = controller.text.trim();
              if (text.isNotEmpty) {
                filterService.addBlacklistWord(text);
                Navigator.pop(ctx);
              }
            },
            child: Text(
              'Заблокировать',
              style: KTypography.caption.copyWith(color: KColors.ink, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return KGlassContainer(
      borderRadius: 24,
      blurSigma: 24,
      backgroundColor: const Color(0xF20F0F12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      margin: const EdgeInsets.all(12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Верхний хэндл
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: KColors.faint.withOpacity(0.5),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Заголовок
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.shieldAlert, size: 20, color: KColors.lav),
                  const SizedBox(width: 8),
                  Text('Фильтр спама и ботов', style: KTypography.sectionHeader),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: KColors.accBg,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: KColors.accBorder, width: 0.8),
                ),
                child: Text(
                  'Anti-Spam Engine',
                  style: KTypography.monoStats.copyWith(
                    fontSize: 9,
                    color: KColors.lavInk,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // ПЕРЕКЛЮЧАТЕЛИ ФИЛЬТРАЦИИ
          _buildToggleRow(
            icon: LucideIcons.bot,
            title: 'Скрывать сообщения ботов',
            subtitle: 'Nightbot, StreamElements, Wizebot, Fossabot...',
            value: filterService.hideBotMessages,
            onChanged: filterService.toggleHideBots,
          ),
          const Divider(color: KColors.panelBorder, height: 16),

          _buildToggleRow(
            icon: LucideIcons.link,
            title: 'Фильтровать внешние ссылки',
            subtitle: 'Блокирует сторонние url и рекламу',
            value: filterService.filterLinks,
            onChanged: filterService.toggleFilterLinks,
          ),
          const Divider(color: KColors.panelBorder, height: 16),

          _buildToggleRow(
            icon: LucideIcons.copyCheck,
            title: 'Дедупликация копипасты',
            subtitle: 'Скрывает одинаковый массовый спам',
            value: filterService.deduplicateCopypasta,
            onChanged: filterService.toggleDeduplicateCopypasta,
          ),
          const Divider(color: KColors.panelBorder, height: 18),

          // СЕКЦИЯ ЧЕРНОГО СПИСКА СЛОВ
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Черный список слов:', style: KTypography.caption.copyWith(color: KColors.muted)),
              GestureDetector(
                onTap: () => _showAddWordDialog(context),
                child: Row(
                  children: [
                    const Icon(LucideIcons.plus, size: 14, color: KColors.lav),
                    const SizedBox(width: 4),
                    Text(
                      'Добавить',
                      style: KTypography.caption.copyWith(
                        color: KColors.lav,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: filterService.blacklistWords.map((word) {
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: KColors.well,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: KColors.panelBorder, width: 0.8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      word,
                      style: KTypography.monoStats.copyWith(
                        fontSize: 11,
                        color: KColors.ink,
                      ),
                    ),
                    const SizedBox(width: 6),
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.lightImpact();
                        filterService.removeBlacklistWord(word);
                      },
                      child: const Icon(LucideIcons.x, size: 12, color: KColors.faint),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildToggleRow({
    required IconData icon,
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Row(
      children: [
        Icon(icon, size: 20, color: value ? KColors.lav : KColors.muted),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: KTypography.bodyText.copyWith(fontWeight: FontWeight.w600)),
              Text(subtitle, style: KTypography.caption.copyWith(color: KColors.muted, fontSize: 11)),
            ],
          ),
        ),
        Switch(
          value: value,
          activeColor: KColors.lav,
          onChanged: (val) {
            HapticFeedback.selectionClick();
            onChanged(val);
          },
        ),
      ],
    );
  }
}
