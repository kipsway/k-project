import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/services/stream_zen_mode_controller.dart';

/// Плавающий стеклянный индикатор активации Дзен-режима.
/// Плавно появляется в верхней части плеера на 3 секунды, уведомляя
/// пользователя о скрытии всех элементов интерфейса и подсказывая выход.
class ZenModeIndicatorPill extends StatelessWidget {
  final StreamZenModeController zenController;

  const ZenModeIndicatorPill({
    super.key,
    required this.zenController,
  });

  @override
  Widget build(BuildContext context) {
    if (!zenController.showPillIndicator) {
      return const SizedBox.shrink();
    }

    return Positioned(
      top: 24,
      left: 0,
      right: 0,
      child: Center(
        child: GestureDetector(
          onTap: () {
            HapticFeedback.selectionClick();
            zenController.dismissPill();
          },
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 300),
            opacity: zenController.showPillIndicator ? 1.0 : 0.0,
            child: KGlassContainer(
              borderRadius: 999,
              blurSigma: 16,
              backgroundColor: const Color(0xE60F0F12),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              border: Border.all(color: KColors.accBorder, width: 1),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 22,
                    height: 22,
                    decoration: const BoxDecoration(
                      color: KColors.accBg,
                      shape: BoxShape.circle,
                    ),
                    child: const Center(
                      child: Icon(
                        LucideIcons.eyeOff,
                        color: KColors.lav,
                        size: 13,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Режим Дзен активирован',
                    style: KTypography.caption.copyWith(
                      color: KColors.ink,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '• Тапните для выхода',
                    style: KTypography.caption.copyWith(
                      color: KColors.muted,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
