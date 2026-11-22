import 'dart:ui';
import 'package:flutter/material.dart';
import 'k_colors.dart';

/// Виджет "Жидкое стекло" (Liquid Glass)
/// Реализует оптический блюр (sigma: 20-24) с линзовым бликом по верхнему краю
class KGlassContainer extends StatelessWidget {
  final Widget child;
  final double borderRadius;
  final double blurSigma;
  final Color backgroundColor;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final Border? customBorder;
  final double? width;
  final double? height;

  const KGlassContainer({
    super.key,
    required this.child,
    this.borderRadius = 24.0,
    this.blurSigma = 20.0,
    this.backgroundColor = const Color(0x990F0F12), // 60% прозрачности панелей
    this.padding,
    this.margin,
    this.customBorder,
    this.width,
    this.height,
  });

  /// Капсула жидкого стекла (Stadium pill 999px)
  factory KGlassContainer.capsule({
    required Widget child,
    double blurSigma = 20.0,
    Color backgroundColor = const Color(0xAA1C1B21),
    EdgeInsetsGeometry? padding,
    EdgeInsetsGeometry? margin,
    Border? customBorder,
    double? width,
    double? height,
  }) {
    return KGlassContainer(
      borderRadius: 999.0,
      blurSigma: blurSigma,
      backgroundColor: backgroundColor,
      padding: padding ?? const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      margin: margin,
      customBorder: customBorder,
      width: width,
      height: height,
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      margin: margin,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: blurSigma, sigmaY: blurSigma),
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              color: backgroundColor,
              borderRadius: BorderRadius.circular(borderRadius),
              border: customBorder ??
                  Border.all(
                    color: KColors.glassBorderTop,
                    width: 1.0,
                  ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.35),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}
