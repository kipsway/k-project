import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/services/stream_recorder_service.dart';

/// Плавающий пульсирующий бейдж активной записи стрима.
/// Отображает текущий таймер записи, расчетный объем файла
/// и позволяет завершить запись в один тап.
class RecordingIndicatorBadge extends StatefulWidget {
  final StreamRecorderService recorderService;
  final VoidCallback onStopRecording;

  const RecordingIndicatorBadge({
    super.key,
    required this.recorderService,
    required this.onStopRecording,
  });

  @override
  State<RecordingIndicatorBadge> createState() => _RecordingIndicatorBadgeState();
}

class _RecordingIndicatorBadgeState extends State<RecordingIndicatorBadge>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulseController;
  late final Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.4, end: 1.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.recorderService.isRecording) {
      return const SizedBox.shrink();
    }

    return AnimatedBuilder(
      animation: Listenable.merge([widget.recorderService, _pulseAnimation]),
      builder: (context, _) {
        return GestureDetector(
          onTap: () {
            HapticFeedback.heavyImpact();
            widget.onStopRecording();
          },
          child: KGlassContainer(
            borderRadius: 999,
            blurSigma: 16,
            backgroundColor: const Color(0xE61A0C0E),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            border: Border.all(color: KColors.red.withOpacity(0.8), width: 1.2),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Пульсирующая красная точка
                Opacity(
                  opacity: _pulseAnimation.value,
                  child: Container(
                    width: 9,
                    height: 9,
                    decoration: const BoxDecoration(
                      color: KColors.red,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: KColors.red,
                          blurRadius: 6,
                          spreadRadius: 1,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  'REC ${widget.recorderService.formattedCurrentTime}',
                  style: KTypography.monoStats.copyWith(
                    color: KColors.ink,
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '• ${widget.recorderService.formattedEstimatedSize}',
                  style: KTypography.caption.copyWith(
                    color: KColors.muted,
                    fontSize: 10,
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(
                  LucideIcons.square,
                  size: 11,
                  color: KColors.red,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
