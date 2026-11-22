import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/colors.dart';

/// Виджет «Жидкое стекло» (Liquid Glass).
/// Сочетает оптический блюр BackdropFilter (sigma 24) и
/// тонкую градиентную рамку 1px с линзовым бликом по верхнему краю.
class GlassContainer extends StatelessWidget {
  final Widget child;
  final double? width;
  final double? height;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final BorderRadius? borderRadius;
  final Color? color;
  final double blur;
  final VoidCallback? onTap;

  const GlassContainer({
    super.key,
    required this.child,
    this.width,
    this.height,
    this.padding,
    this.margin,
    this.borderRadius,
    this.color,
    this.blur = 24.0,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final effectiveRadius = borderRadius ?? BorderRadius.circular(24);

    Widget content = Container(
      width: width,
      height: height,
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color ?? KColors.glassSurface,
        borderRadius: effectiveRadius,
      ),
      child: child,
    );

    // Обертка с градиентным линзовым бликом (рамка 1px)
    Widget glass = CustomPaint(
      painter: _GlassBorderPainter(
        radius: effectiveRadius,
        strokeWidth: 1.0,
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            KColors.glassBorderTop,    // 18% white блик сверху
            KColors.panelBorder,       // #2C2B32 посередине
            KColors.glassBorderBottom, // 2% white снизу
          ],
          stops: [0.0, 0.45, 1.0],
        ),
      ),
      child: content,
    );

    // Размытие фона (BackdropFilter)
    Widget blurred = ClipRRect(
      borderRadius: effectiveRadius,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: glass,
      ),
    );

    if (onTap != null) {
      blurred = Material(
        color: Colors.transparent,
        borderRadius: effectiveRadius,
        child: InkWell(
          borderRadius: effectiveRadius,
          splashColor: KColors.lav.withOpacity(0.08),
          highlightColor: KColors.lav.withOpacity(0.04),
          onTap: onTap,
          child: blurred,
        ),
      );
    }

    if (margin != null) {
      blurred = Padding(padding: margin!, child: blurred);
    }

    return blurred;
  }
}

/// CustomPainter для отрисовки бесшовной градиентной рамки
class _GlassBorderPainter extends CustomPainter {
  final BorderRadius radius;
  final double strokeWidth;
  final Gradient gradient;

  _GlassBorderPainter({
    required this.radius,
    required this.strokeWidth,
    required this.gradient,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final rrect = radius.toRRect(rect).deflate(strokeWidth / 2);

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
