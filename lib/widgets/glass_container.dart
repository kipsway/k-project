import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/colors.dart';

/// Виджет «Жидкое стекло» (Liquid Glass).
/// Реализует премиальное размытие заднего плана (24px) и
/// оптический линзовый блик по верхней грани рамки.
class GlassContainer extends StatelessWidget {
  final Widget child;
  final double radius;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final double? width;
  final double? height;
  final Color? backgroundColor;
  final Gradient? borderGradient;
  final double borderWidth;
  final double blur;
  final bool showShadow;
  final VoidCallback? onTap;

  const GlassContainer({
    super.key,
    required this.child,
    this.radius = 24.0,
    this.padding,
    this.margin,
    this.width,
    this.height,
    this.backgroundColor,
    this.borderGradient,
    this.borderWidth = 1.0,
    this.blur = 24.0,
    this.showShadow = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final borderRadius = BorderRadius.circular(radius);
    final surfaceColor = backgroundColor ?? KColors.panel.withOpacity(0.75);

    Widget content = Container(
      width: width,
      height: height,
      padding: padding,
      decoration: BoxDecoration(
        color: surfaceColor,
        borderRadius: borderRadius,
      ),
      child: child,
    );

    if (onTap != null) {
      content = Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: borderRadius,
          splashColor: KColors.lav.withOpacity(0.08),
          highlightColor: KColors.lav.withOpacity(0.04),
          onTap: onTap,
          child: content,
        ),
      );
    }

    Widget glass = ClipRRect(
      borderRadius: borderRadius,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: CustomPaint(
          foregroundPainter: _GlassBorderPainter(
            radius: radius,
            strokeWidth: borderWidth,
            gradient: borderGradient ?? KColors.glassBorderGradient,
          ),
          child: content,
        ),
      ),
    );

    if (showShadow) {
      glass = Container(
        decoration: BoxDecoration(
          borderRadius: borderRadius,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.4),
              blurRadius: 28,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: glass,
      );
    }

    if (margin != null) {
      glass = Padding(padding: margin!, child: glass);
    }

    return glass;
  }
}

/// Отрисовка точной градиентной рамки со скруглением без артефактов растеризации
class _GlassBorderPainter extends CustomPainter {
  final double radius;
  final double strokeWidth;
  final Gradient gradient;

  const _GlassBorderPainter({
    required this.radius,
    required this.strokeWidth,
    required this.gradient,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final halfStroke = strokeWidth / 2;
    final rect = Rect.fromLTWH(
      halfStroke,
      halfStroke,
      size.width - strokeWidth,
      size.height - strokeWidth,
    );
    final rrect = RRect.fromRectAndRadius(rect, Radius.circular(radius));

    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..shader = gradient.createShader(rect);

    canvas.drawRRect(rrect, paint);
  }

  @override
  bool shouldRepaint(covariant _GlassBorderPainter oldDelegate) {
    return oldDelegate.radius != radius ||
        oldDelegate.strokeWidth != strokeWidth ||
        oldDelegate.gradient != gradient;
  }
}
