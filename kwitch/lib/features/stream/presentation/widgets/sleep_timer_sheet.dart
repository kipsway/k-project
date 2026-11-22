import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/services/amoled_mode_controller.dart';
import '../../domain/services/sleep_timer_service.dart';

class SleepTimerSheet extends StatelessWidget {
  final SleepTimerService timerService;
  final AmoledModeController amoledController;
  final VoidCallback onTimerFinished;

  const SleepTimerSheet({
    super.key,
    required this.timerService,
    required this.amoledController,
    required this.onTimerFinished,
  });

  static void show(
    BuildContext context, {
    required SleepTimerService timerService,
    required AmoledModeController amoledController,
    required VoidCallback onTimerFinished,
  }) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => AnimatedBuilder(
        animation: Listenable.merge([timerService, amoledController]),
        builder: (context, _) => SleepTimerSheet(
          timerService: timerService,
          amoledController: amoledController,
          onTimerFinished: onTimerFinished,
        ),
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
                  const Icon(LucideIcons.moon, size: 20, color: KColors.lav),
                  const SizedBox(width: 8),
                  Text('Спящий таймер', style: KTypography.sectionHeader),
                ],
              ),
              if (timerService.isActive)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: KColors.accBg,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: KColors.accBorder, width: 0.8),
                  ),
                  child: Text(
                    'Осталось: ${timerService.formattedRemaining}',
                    style: KTypography.monoStats.copyWith(
                      color: KColors.lavInk,
                      fontSize: 11,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Плеер плавно снизит громкость за 60 секунд до паузы',
            style: KTypography.bodyMuted.copyWith(fontSize: 12),
          ),
          const SizedBox(height: 14),

          // Пресеты времени
          Row(
            children: [
              _buildPresetButton(context, minutes: 15),
              const SizedBox(width: 8),
              _buildPresetButton(context, minutes: 30),
              const SizedBox(width: 8),
              _buildPresetButton(context, minutes: 45),
              const SizedBox(width: 8),
              _buildPresetButton(context, minutes: 60),
            ],
          ),
          if (timerService.isActive) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () {
                  HapticFeedback.lightImpact();
                  timerService.cancelTimer();
                  Navigator.pop(context);
                },
                icon: const Icon(LucideIcons.xCircle, size: 16),
                label: const Text('Отключить таймер'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: KColors.cellOff,
                  foregroundColor: KColors.redInk,
                  shape: const StadiumBorder(),
                  side: const BorderSide(color: KColors.panelBorder),
                ),
              ),
            ),
          ],
          const Divider(color: KColors.panelBorder, height: 24),

          // Переключатель AMOLED-режима
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.batteryCharging, size: 18, color: KColors.green),
                  const SizedBox(width: 8),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Режим AMOLED (Чистый черный)', style: KTypography.chipLabel),
                      Text(
                        'Экономит батарею на OLED-экранах',
                        style: KTypography.caption.copyWith(color: KColors.faint),
                      ),
                    ],
                  ),
                ],
              ),
              Switch(
                value: amoledController.isAmoledEnabled,
                onChanged: (val) {
                  HapticFeedback.selectionClick();
                  amoledController.toggleAmoled(val);
                },
                activeColor: KColors.lav,
                activeTrackColor: KColors.accBg,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPresetButton(BuildContext context, {required int minutes}) {
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            HapticFeedback.selectionClick();
            timerService.startTimer(
              Duration(minutes: minutes),
              onCompleted: onTimerFinished,
            );
            Navigator.pop(context);
          },
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: KColors.cellOff,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: KColors.panelBorder, width: 0.8),
            ),
            child: Center(
              child: Text(
                '$minutes м',
                style: KTypography.chipLabel.copyWith(fontSize: 12),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
