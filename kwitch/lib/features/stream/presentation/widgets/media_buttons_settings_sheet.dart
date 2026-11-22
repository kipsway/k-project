import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/services/media_buttons_service.dart';

/// Шторка настройки действий аппаратных кнопок гарнитуры и Bluetooth в kWitch.
/// Позволяет переназначать клики на догон прямого эфира, повтор 30с или переключение каналов,
/// а также проверять работу кнопок в интерактивном тестере.
class MediaButtonsSettingsSheet extends StatelessWidget {
  final MediaButtonsService service;

  const MediaButtonsSettingsSheet({
    super.key,
    required this.service,
  });

  static void show(BuildContext context, MediaButtonsService service) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => AnimatedBuilder(
        animation: service,
        builder: (context, _) => MediaButtonsSettingsSheet(service: service),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isEnabled = service.isEnabled;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.85,
      ),
      child: KGlassContainer(
        borderRadius: 24,
        blurSigma: 24,
        backgroundColor: const Color(0xF20F0F12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        margin: const EdgeInsets.all(12),
        child: SingleChildScrollView(
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
                      color: KColors.accBg,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: KColors.accBorder, width: 1),
                    ),
                    child: const Icon(LucideIcons.headphones, color: KColors.lav, size: 18),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Кнопки гарнитуры и Bluetooth',
                          style: KTypography.sheetTitle.copyWith(color: KColors.ink),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'MediaButtons Remote Controller',
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
                      service.toggleEnabled(val);
                    },
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Карточка интерактивного тестера кнопок
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: KColors.well,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: KColors.panelBorder, width: 0.8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: service.lastEventTime != null ? KColors.green : KColors.faint,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'ЖИВОЙ ТЕСТЕР НАЖАТИЙ',
                          style: KTypography.caption.copyWith(
                            color: KColors.faint,
                            fontSize: 10,
                            letterSpacing: 1.0,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      service.lastEventName,
                      style: KTypography.bodySmall.copyWith(
                        color: KColors.ink,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        OutlinedButton.icon(
                          onPressed: () {
                            HapticFeedback.selectionClick();
                            service.handleHeadsetClick();
                          },
                          icon: const Icon(LucideIcons.play, size: 13),
                          label: const Text('Клик (1x)'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: KColors.lav,
                            side: const BorderSide(color: KColors.accBorder),
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          ),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton.icon(
                          onPressed: () {
                            HapticFeedback.selectionClick();
                            service.handleHeadsetClick();
                            service.handleHeadsetClick();
                          },
                          icon: const Icon(LucideIcons.fastForward, size: 13),
                          label: const Text('Двойной (2x)'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: KColors.lav,
                            side: const BorderSide(color: KColors.accBorder),
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              // Действие двойного клика
              Text(
                'ДЕЙСТВИЕ ДВОЙНОГО КЛИКА (2x)',
                style: KTypography.caption.copyWith(
                  color: KColors.faint,
                  fontSize: 10,
                  letterSpacing: 1.0,
                ),
              ),
              const SizedBox(height: 8),

              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _buildActionChip(
                    action: HeadsetMultiClickAction.jumpToLive,
                    title: 'Догон прямого эфира',
                    icon: LucideIcons.radio,
                    isSelected: service.doubleClickAction == HeadsetMultiClickAction.jumpToLive,
                    onTap: () => service.setDoubleClickAction(HeadsetMultiClickAction.jumpToLive),
                  ),
                  _buildActionChip(
                    action: HeadsetMultiClickAction.nextChannel,
                    title: 'Следующий стример',
                    icon: LucideIcons.skipForward,
                    isSelected: service.doubleClickAction == HeadsetMultiClickAction.nextChannel,
                    onTap: () => service.setDoubleClickAction(HeadsetMultiClickAction.nextChannel),
                  ),
                  _buildActionChip(
                    action: HeadsetMultiClickAction.instantReplay30s,
                    title: 'Мгновенный повтор 30с',
                    icon: LucideIcons.rotateCcw,
                    isSelected: service.doubleClickAction == HeadsetMultiClickAction.instantReplay30s,
                    onTap: () => service.setDoubleClickAction(HeadsetMultiClickAction.instantReplay30s),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Действие тройного клика
              Text(
                'ДЕЙСТВИЕ ТРОЙНОГО КЛИКА (3x)',
                style: KTypography.caption.copyWith(
                  color: KColors.faint,
                  fontSize: 10,
                  letterSpacing: 1.0,
                ),
              ),
              const SizedBox(height: 8),

              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _buildActionChip(
                    action: HeadsetMultiClickAction.instantReplay30s,
                    title: 'Мгновенный повтор 30с',
                    icon: LucideIcons.rotateCcw,
                    isSelected: service.tripleClickAction == HeadsetMultiClickAction.instantReplay30s,
                    onTap: () => service.setTripleClickAction(HeadsetMultiClickAction.instantReplay30s),
                  ),
                  _buildActionChip(
                    action: HeadsetMultiClickAction.toggleAudioOnly,
                    title: 'Режим «Только радио»',
                    icon: LucideIcons.radio,
                    isSelected: service.tripleClickAction == HeadsetMultiClickAction.toggleAudioOnly,
                    onTap: () => service.setTripleClickAction(HeadsetMultiClickAction.toggleAudioOnly),
                  ),
                  _buildActionChip(
                    action: HeadsetMultiClickAction.toggleMute,
                    title: 'Заглушить звук Mute',
                    icon: LucideIcons.volumeX,
                    isSelected: service.tripleClickAction == HeadsetMultiClickAction.toggleMute,
                    onTap: () => service.setTripleClickAction(HeadsetMultiClickAction.toggleMute),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Подсказка
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: KColors.well.withOpacity(0.5),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: KColors.panelBorder, width: 0.8),
                ),
                child: Row(
                  children: [
                    const Icon(LucideIcons.bluetooth, size: 14, color: KColors.muted),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Поддерживаются любые наушники Bluetooth (AirPods, Galaxy Buds, Sony) и кнопки на проводе.',
                        style: KTypography.caption.copyWith(
                          color: KColors.muted,
                          fontSize: 10.5,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActionChip({
    required HeadsetMultiClickAction action,
    required String title,
    required IconData icon,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? KColors.accBg : KColors.well,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? KColors.lav : KColors.panelBorder,
            width: isSelected ? 1.2 : 0.8,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 13,
              color: isSelected ? KColors.lav : KColors.muted,
            ),
            const SizedBox(width: 6),
            Text(
              title,
              style: KTypography.caption.copyWith(
                color: isSelected ? KColors.ink : KColors.muted,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
