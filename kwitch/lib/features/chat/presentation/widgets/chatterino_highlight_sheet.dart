import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/models/chatterino_highlight_rule.dart';
import '../../domain/services/chatterino_highlight_service.dart';

class ChatterinoHighlightSheet extends StatelessWidget {
  final ChatterinoHighlightService highlightService;

  const ChatterinoHighlightSheet({
    super.key,
    required this.highlightService,
  });

  static void show(BuildContext context, ChatterinoHighlightService highlightService) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => AnimatedBuilder(
        animation: highlightService,
        builder: (context, _) => ChatterinoHighlightSheet(highlightService: highlightService),
      ),
    );
  }

  void _showAddRuleDialog(BuildContext context) {
    final controller = TextEditingController();
    bool isRegex = false;
    Color selectedColor = const Color(0xFF7E6FC4);

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          backgroundColor: KColors.panel,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: const BorderSide(color: KColors.accBorder, width: 1),
          ),
          title: Text(
            'Новое ключевое слово',
            style: KTypography.titleBold.copyWith(fontSize: 16),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: controller,
                autofocus: true,
                style: KTypography.body.copyWith(color: KColors.ink),
                decoration: InputDecoration(
                  hintText: 'Слово или фраза...',
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
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Регулярное выражение (Regex)', style: KTypography.caption),
                  Switch(
                    value: isRegex,
                    activeColor: KColors.lav,
                    onChanged: (val) => setDialogState(() => isRegex = val),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text('Цвет подсветки:', style: KTypography.caption),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  const Color(0xFF7E6FC4), // Лаванда
                  const Color(0xFFF59E0B), // Золото
                  const Color(0xFF10B981), // Изумруд
                  const Color(0xFFEF4444), // Рубин
                  const Color(0xFF3B82F6), // Сапфир
                ].map((c) {
                  final isSelected = selectedColor.value == c.value;
                  return GestureDetector(
                    onTap: () => setDialogState(() => selectedColor = c),
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: c,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: isSelected ? Colors.white : Colors.transparent,
                          width: 2,
                        ),
                      ),
                    ),
                  );
                }).toList(),
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
                final text = controller.text.trim();
                if (text.isNotEmpty) {
                  highlightService.addRule(
                    pattern: text,
                    isRegex: isRegex,
                    color: selectedColor,
                  );
                  Navigator.pop(ctx);
                }
              },
              child: Text('Добавить', style: KTypography.caption.copyWith(color: KColors.ink, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  void _showChangeUsernameDialog(BuildContext context) {
    final controller = TextEditingController(text: highlightService.currentUsername);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: KColors.panel,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: KColors.accBorder, width: 1),
        ),
        title: Text('Ваш никнейм на Twitch', style: KTypography.titleBold.copyWith(fontSize: 16)),
        content: TextField(
          controller: controller,
          autofocus: true,
          style: KTypography.body.copyWith(color: KColors.ink),
          decoration: InputDecoration(
            hintText: 'Никнейм...',
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
              final name = controller.text.trim();
              if (name.isNotEmpty) {
                highlightService.setCurrentUsername(name);
                Navigator.pop(ctx);
              }
            },
            child: Text('Сохранить', style: KTypography.caption.copyWith(color: KColors.ink, fontWeight: FontWeight.bold)),
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
                  const Icon(LucideIcons.bellRing, size: 20, color: KColors.lav),
                  const SizedBox(width: 8),
                  Text('Подсветка и Меншны', style: KTypography.sectionHeader),
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
                  'Chatterino+ Highlights',
                  style: KTypography.monoStats.copyWith(
                    fontSize: 9,
                    color: KColors.lavInk,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Карточка текущего ника
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: KColors.well,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: KColors.panelBorder, width: 0.8),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(LucideIcons.atSign, size: 18, color: KColors.lav),
                    const SizedBox(width: 8),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Ваш логин для авто-упоминаний:', style: KTypography.caption),
                        Text(
                          highlightService.currentUsername,
                          style: KTypography.bodyText.copyWith(
                            color: KColors.ink,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                IconButton(
                  onPressed: () => _showChangeUsernameDialog(context),
                  icon: const Icon(LucideIcons.edit2, size: 16, color: KColors.muted),
                  tooltip: 'Изменить логин',
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          Text('Правила подсветки сообщений:', style: KTypography.caption.copyWith(color: KColors.muted)),
          const SizedBox(height: 8),

          // Список правил
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 260),
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: highlightService.rules.length,
              itemBuilder: (context, index) {
                final rule = highlightService.rules[index];
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: KColors.panel,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: rule.isEnabled ? rule.color.withOpacity(0.5) : KColors.panelBorder,
                      width: 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      // Индикатор цвета
                      Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: rule.color,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 10),
                      // Описание правила
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              rule.label.isNotEmpty ? rule.label : rule.pattern,
                              style: KTypography.body.copyWith(
                                color: rule.isEnabled ? KColors.ink : KColors.muted,
                                fontWeight: rule.isEnabled ? FontWeight.w600 : FontWeight.normal,
                              ),
                            ),
                            if (rule.isRegex)
                              Text(
                                'Regex: ${rule.pattern}',
                                style: KTypography.monoStats.copyWith(fontSize: 10, color: KColors.faint),
                              ),
                          ],
                        ),
                      ),
                      // Кнопка удаления (для кастомных)
                      if (!rule.isSelfMention && rule.id.startsWith('rule_'))
                        IconButton(
                          onPressed: () => highlightService.removeRule(rule.id),
                          icon: const Icon(LucideIcons.trash2, size: 15, color: KColors.faint),
                          tooltip: 'Удалить правило',
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          constraints: const BoxConstraints(),
                        ),
                      // Свитч включения/выключения
                      Switch(
                        value: rule.isEnabled,
                        activeColor: rule.color,
                        onChanged: (val) {
                          HapticFeedback.selectionClick();
                          highlightService.toggleRule(rule.id, val);
                        },
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 10),

          // Кнопка добавления ключевого слова
          GestureDetector(
            onTap: () => _showAddRuleDialog(context),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: KColors.accBg,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: KColors.accBorder, width: 1),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(LucideIcons.plus, size: 18, color: KColors.lav),
                  const SizedBox(width: 8),
                  Text(
                    'Добавить ключевое слово',
                    style: KTypography.bodyText.copyWith(
                      color: KColors.lavInk,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
