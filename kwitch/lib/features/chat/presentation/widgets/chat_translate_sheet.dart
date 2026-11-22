import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/services/chat_translate_service.dart';

/// Шторка настроек инлайн-переводчика чата Chatterino+ в kWitch.
/// Позволяет выбрать целевой язык, настроить авто-перевод сообщений
/// и управлять локальным LRU-кэшем переведенных фраз и паст.
class ChatTranslateSheet extends StatelessWidget {
  final ChatTranslateService translateService;

  const ChatTranslateSheet({
    super.key,
    required this.translateService,
  });

  static void show(BuildContext context, ChatTranslateService translateService) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => AnimatedBuilder(
        animation: translateService,
        builder: (context, _) => ChatTranslateSheet(translateService: translateService),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isEnabled = translateService.isEnabled;

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

          // Заголовок и выключатель
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: isEnabled ? KColors.accBg : KColors.well,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: isEnabled ? KColors.accBorder : KColors.panelBorder,
                    width: 1,
                  ),
                ),
                child: Icon(
                  LucideIcons.languages,
                  color: isEnabled ? KColors.lav : KColors.muted,
                  size: 18,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Инлайн-переводчик чата',
                      style: KTypography.sheetTitle.copyWith(color: KColors.ink),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Chatterino+ Inline Translation Engine',
                      style: KTypography.caption.copyWith(color: KColors.muted),
                    ),
                  ],
                ),
              ),
              Switch(
                value: isEnabled,
                activeColor: KColors.lav,
                activeTrackColor: KColors.accBorder,
                inactiveThumbColor: KColors.muted,
                inactiveTrackColor: KColors.well,
                onChanged: (val) {
                  HapticFeedback.selectionClick();
                  translateService.toggleEnabled(val);
                },
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Выбор целевого языка
          Text(
            'ЦЕЛЕВОЙ ЯЗЫК ПЕРЕВОДА',
            style: KTypography.caption.copyWith(
              color: KColors.faint,
              fontSize: 10,
              letterSpacing: 1.0,
            ),
          ),
          const SizedBox(height: 8),

          Row(
            children: [
              _buildLangChip('ru', 'Русский (RU)', LucideIcons.globe),
              const SizedBox(width: 8),
              _buildLangChip('en', 'English (EN)', LucideIcons.messageSquare),
              const SizedBox(width: 8),
              _buildLangChip('de', 'Deutsch (DE)', LucideIcons.flag),
            ],
          ),
          const SizedBox(height: 16),

          // Опции перевода
          Container(
            decoration: BoxDecoration(
              color: KColors.well,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: KColors.panelBorder, width: 0.8),
            ),
            child: Column(
              children: [
                // Автоматический перевод зарубежных сообщений
                SwitchListTile(
                  title: Text(
                    'Авто-перевод зарубежных чатов',
                    style: KTypography.bodySmall.copyWith(color: KColors.ink),
                  ),
                  subtitle: Text(
                    'Автоматически раскрывать плашку перевода без нажатия [🌐]',
                    style: KTypography.caption.copyWith(color: KColors.muted),
                  ),
                  value: translateService.autoTranslateForeign,
                  activeColor: KColors.lav,
                  onChanged: isEnabled
                      ? (val) {
                          HapticFeedback.selectionClick();
                          translateService.toggleAutoTranslate(val);
                        }
                      : null,
                ),
                const Divider(height: 1, color: KColors.panelBorder),

                // Сохранение смайлов
                SwitchListTile(
                  title: Text(
                    'Защита смайлов 7TV / BTTV / FFZ',
                    style: KTypography.bodySmall.copyWith(color: KColors.ink),
                  ),
                  subtitle: Text(
                    'Не переводить коды смайлов (KEKW, monkaW, PogChamp)',
                    style: KTypography.caption.copyWith(color: KColors.muted),
                  ),
                  value: translateService.preserveEmotes,
                  activeColor: KColors.lav,
                  onChanged: isEnabled
                      ? (val) {
                          HapticFeedback.selectionClick();
                          translateService.togglePreserveEmotes(val);
                        }
                      : null,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Кэш и статистика переводов
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: KColors.well,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: KColors.panelBorder, width: 0.8),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Кэш переводов и сленга',
                      style: KTypography.bodySmall.copyWith(
                        color: KColors.ink,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Сохранено: ${translateService.cachedTranslationsCount} фраз (Zero-Lag)',
                      style: KTypography.caption.copyWith(color: KColors.muted),
                    ),
                  ],
                ),
                TextButton(
                  onPressed: translateService.cachedTranslationsCount > 0
                      ? () {
                          HapticFeedback.mediumImpact();
                          translateService.clearCache();
                        }
                      : null,
                  style: TextButton.styleFrom(
                    foregroundColor: KColors.red,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  ),
                  child: const Text('Очистить'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLangChip(String code, String title, IconData icon) {
    final isSelected = translateService.targetLanguage == code;

    return Expanded(
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          translateService.setTargetLanguage(code);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? KColors.accBg : KColors.well,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isSelected ? KColors.lav : KColors.panelBorder,
              width: isSelected ? 1.2 : 0.8,
            ),
          ),
          child: Column(
            children: [
              Icon(
                icon,
                size: 15,
                color: isSelected ? KColors.lav : KColors.muted,
              ),
              const SizedBox(height: 4),
              Text(
                title,
                style: KTypography.caption.copyWith(
                  color: isSelected ? KColors.ink : KColors.muted,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                  fontSize: 10.5,
                ),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
