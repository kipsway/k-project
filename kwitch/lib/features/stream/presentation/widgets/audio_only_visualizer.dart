import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/services/audio_only_mode_controller.dart';

class AudioOnlyVisualizer extends StatefulWidget {
  final String streamerName;
  final String categoryName;
  final String? streamerAvatarUrl;
  final AudioOnlyModeController controller;
  final VoidCallback onDisableAudioOnly;

  const AudioOnlyVisualizer({
    super.key,
    required this.streamerName,
    required this.categoryName,
    this.streamerAvatarUrl,
    required this.controller,
    required this.onDisableAudioOnly,
  });

  @override
  State<AudioOnlyVisualizer> createState() => _AudioOnlyVisualizerState();
}

class _AudioOnlyVisualizerState extends State<AudioOnlyVisualizer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _animController;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      decoration: const BoxDecoration(
        gradient: RadialGradient(
          center: Alignment(0.0, -0.1),
          radius: 1.1,
          colors: [
            Color(0xFF1E1730),
            Color(0xFF0D0B12),
            Colors.black,
          ],
        ),
      ),
      child: Center(
        child: SingleChildScrollView(
          physics: const NeverScrollableScrollPhysics(),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Аватар стримера с лавандовым свечением
              AnimatedBuilder(
                animation: _animController,
                builder: (context, child) {
                  final glowRadius = 8.0 + 8.0 * _animController.value;
                  return Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: KColors.lav, width: 2),
                      boxShadow: [
                        BoxShadow(
                          color: KColors.lav.withOpacity(0.35 * _animController.value),
                          blurRadius: glowRadius,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                    child: ClipOval(
                      child: widget.streamerAvatarUrl != null
                          ? Image.network(widget.streamerAvatarUrl!, fit: BoxFit.cover)
                          : const Icon(LucideIcons.headphones, size: 36, color: KColors.lav),
                    ),
                  );
                },
              ),
              const SizedBox(height: 12),

              // Имя стримера и категория
              Text(
                widget.streamerName,
                style: KTypography.titleBold.copyWith(fontSize: 16),
              ),
              const SizedBox(height: 2),
              Text(
                widget.categoryName,
                style: KTypography.caption.copyWith(color: KColors.lavInk),
              ),
              const SizedBox(height: 14),

              // Анимированный эквалайзер (6 полос спектра)
              AnimatedBuilder(
                animation: _animController,
                builder: (context, child) {
                  return Row(
                    mainAxisSize: MainAxisSize.min,
                    children: List.generate(6, (index) {
                      final phase = (index * 0.45);
                      final wave = (math.sin((_animController.value * 2 * math.pi) + phase) + 1) / 2;
                      final barHeight = 6.0 + 20.0 * wave;
                      return Container(
                        margin: const EdgeInsets.symmetric(horizontal: 2.5),
                        width: 4,
                        height: barHeight,
                        decoration: BoxDecoration(
                          color: KColors.lav,
                          borderRadius: BorderRadius.circular(999),
                        ),
                      );
                    }),
                  );
                },
              ),
              const SizedBox(height: 14),

              // Бейдж режима радио и битрейта
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: KColors.accBg,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: KColors.accBorder, width: 0.8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(LucideIcons.radio, size: 13, color: KColors.lav),
                    const SizedBox(width: 6),
                    Text(
                      'Режим радио • 160 kbps (экономия ~98% трафика)',
                      style: KTypography.monoStats.copyWith(
                        fontSize: 11,
                        color: KColors.lavInk,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Кнопка возврата к видео
              GestureDetector(
                onTap: widget.onDisableAudioOnly,
                child: KGlassContainer(
                  borderRadius: 999,
                  blurSigma: 16,
                  backgroundColor: KColors.panel.withOpacity(0.85),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(LucideIcons.video, size: 16, color: KColors.ink),
                      const SizedBox(width: 8),
                      Text(
                        'Включить видео (1440p)',
                        style: KTypography.bodyText.copyWith(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
