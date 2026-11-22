import 'package:flutter/material.dart';
import '../../domain/services/stream_ambient_glow_controller.dart';

/// Виджет динамической эмбиент-подсветки Ambilight вокруг видеоплеера kWitch.
/// Рендерит мягкое рассеянное неоновое свечение за пределами видеопотока,
/// создавая кинематографичный эффект расширения экрана и снижая усталость глаз.
class AmbientGlowWrapper extends StatelessWidget {
  final Widget child;
  final StreamAmbientGlowController? controller;

  const AmbientGlowWrapper({
    super.key,
    required this.child,
    this.controller,
  });

  @override
  Widget build(BuildContext context) {
    if (controller == null || !controller!.isEnabled) {
      return child;
    }

    return AnimatedBuilder(
      animation: controller!,
      builder: (context, _) {
        final glowColor = controller!.activeGlowColor;
        final spread = controller!.spreadRadius;

        return Stack(
          clipBehavior: Clip.none,
          children: [
            // Фоновое размытое пятно свечения Ambilight
            Positioned(
              left: -spread / 2,
              right: -spread / 2,
              top: -spread / 2,
              bottom: -spread / 2,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOutCubic,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: glowColor.withOpacity(controller!.intensity * 0.45),
                      blurRadius: spread * 1.5,
                      spreadRadius: spread * 0.4,
                    ),
                    BoxShadow(
                      color: glowColor.withOpacity(controller!.intensity * 0.25),
                      blurRadius: spread * 2.2,
                      spreadRadius: spread * 0.8,
                    ),
                  ],
                ),
              ),
            ),

            // Основной дочерний контейнер плеера
            child,
          ],
        );
      },
    );
  }
}
