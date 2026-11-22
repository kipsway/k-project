import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/models/chat_display_settings.dart';

class ChatSettingsSheet extends StatelessWidget {
  final ChatDisplaySettings settings;

  const ChatSettingsSheet({
    super.key,
    required this.settings,
  });

  static void show(BuildContext context, ChatDisplaySettings settings) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => AnimatedBuilder(
        animation: settings,
        builder: (context, _) => ChatSettingsSheet(settings: settings),
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
                  const Icon(LucideIcons.sliders, size: 20, color: KColors.lav),
                  const SizedBox(width: 8),
                  Text('Настройки чата', style: KTypography.sectionHeader),
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
                  'Chatterino+ 2.4.0',
                  style: KTypography.monoStats.copyWith(
                    fontSize: 9,
                    color: KColors.lavInk,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // РАЗМЕР ШРИФТА (Слайдер)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Размер шрифта:', style: KTypography.body),
              Text(
                '${settings.fontSize.toInt()} px',
                style: KTypography.monoStats.copyWith(color: KColors.lav),
              ),
            ],
          ),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              activeTrackColor: KColors.lav,
              inactiveTrackColor: KColors.cellOff,
              thumbColor: KColors.lav,
              overlayColor: KColors.lav.withOpacity(0.2),
              trackHeight: 3,
            ),
            child: Slider(
              value: settings.fontSize,
              min: 11.0,
              max: 18.0,
              divisions: 7,
              onChanged: (val) {
                HapticFeedback.selectionClick();
                settings.setFontSize(val);
              },
            ),
          ),

          // ПРЕДПРОСМОТР СООБЩЕНИЯ
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: KColors.well,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: KColors.panelBorder, width: 0.8),
            ),
            child: RichText(
              text: TextSpan(
                children: [
                  if (settings.showTimestamps)
                    TextSpan(
                      text: '19:30 ',
                      style: KTypography.monoStats.copyWith(
                        fontSize: settings.fontSize - 2,
                        color: KColors.faint,
                      ),
                    ),
                  if (settings.enableBadges)
                    WidgetSpan(
                      alignment: PlaceholderAlignment.middle,
                      child: Container(
                        margin: const EdgeInsets.only(right: 4),
                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                        decoration: BoxDecoration(
                          color: KColors.cellOff,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          'MOD',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                            color: KColors.green,
                          ),
                        ),
                      ),
                    ),
                  TextSpan(
                    text: 'kipsway: ',
                    style: TextStyle(
                      fontFamily: 'Montserrat',
                      fontWeight: FontWeight.w700,
                      fontSize: settings.fontSize,
                      color: settings.enableNamePaints ? KColors.lav : KColors.ink,
                    ),
                  ),
                  TextSpan(
                    text: 'Пример отображения текста в чате',
                    style: KTypography.body.copyWith(
                      fontSize: settings.fontSize,
                      color: KColors.ink,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),

          // ТУМБЛЕРЫ ОТОБРАЖЕНИЯ
          _buildToggleRow(
            label: 'Временные метки сообщений',
            value: settings.showTimestamps,
            onChanged: settings.toggleTimestamps,
          ),
          _buildToggleRow(
            label: 'Градиенты никнеймов (Name Paints)',
            value: settings.enableNamePaints,
            onChanged: settings.toggleNamePaints,
          ),
          _buildToggleRow(
            label: 'Значки и бейджи канала',
            value: settings.enableBadges,
            onChanged: settings.toggleBadges,
          ),
          const Divider(color: KColors.panelBorder, height: 20),

          // ВЫБОР ЗЕРКАЛА WEBSOCKET (Rish mirrors)
          Text('Зеркало 7TV EventAPI:', style: KTypography.caption),
          const SizedBox(height: 8),
          Row(
            children: [
              _buildMirrorChip(
                url: 'https://ws.chat.eblo.id',
                label: 'ws.chat.eblo.id',
                isSelected: settings.activeMirror == 'https://ws.chat.eblo.id',
              ),
              const SizedBox(width: 8),
              _buildMirrorChip(
                url: 'https://ws.rish098.xyz',
                label: 'ws.rish098.xyz',
                isSelected: settings.activeMirror == 'https://ws.rish098.xyz',
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildToggleRow({
    required String label,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: KTypography.bodyMuted.copyWith(color: KColors.ink)),
          Switch(
            value: value,
            onChanged: (val) {
              HapticFeedback.selectionClick();
              onChanged(val);
            },
            activeColor: KColors.lav,
            activeTrackColor: KColors.accBg,
          ),
        ],
      ),
    );
  }

  Widget _buildMirrorChip({
    required String url,
    required String label,
    required bool isSelected,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          settings.setActiveMirror(url);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? KColors.accBg : KColors.cellOff,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: isSelected ? KColors.accBorder : KColors.panelBorder,
              width: 1,
            ),
          ),
          child: Center(
            child: Text(
              label,
              style: KTypography.monoStats.copyWith(
                fontSize: 10,
                color: isSelected ? KColors.lavInk : KColors.muted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
