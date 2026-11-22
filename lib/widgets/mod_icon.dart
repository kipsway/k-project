import 'package:flutter/material.dart';
import '../theme/colors.dart';

/// Векторная аппаратная иконка мода для kStore.
/// Отрисовывается через CustomPainter с точной векторной геометрией и
/// градиентами дизайн-системы «Мозаика» от Rish без внешних зависимостей.
class ModIcon extends StatelessWidget {
  final String modId;
  final double size;
  final double radius;
  final bool showBorder;

  const ModIcon({
    super.key,
    required this.modId,
    this.size = 56.0,
    this.radius = 16.0,
    this.showBorder = true,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: KColors.panel,
        borderRadius: BorderRadius.circular(radius),
        border: showBorder
            ? Border.all(color: KColors.panelBorder, width: 1.0)
            : null,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.35),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: CustomPaint(
          size: Size(size, size),
          painter: _ModIconPainter(modId: modId.toLowerCase()),
        ),
      ),
    );
  }
}

class _ModIconPainter extends CustomPainter {
  final String modId;

  const _ModIconPainter({required this.modId});

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final rect = Offset.zero & size;

    // Глубокий ониксовый градиентный фон
    final bgPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          Color(0xFF16151B),
          Color(0xFF0F0E13),
          Color(0xFF09090C),
        ],
      ).createShader(rect);
    canvas.drawRect(rect, bgPaint);

    // Отрисовка фирменного символа мода
    switch (modId) {
      case 'ktok':
        _drawTikTokNote(canvas, size);
        break;
      case 'kgram':
        _drawTelegramPlane(canvas, size);
        break;
      case 'ktube':
        _drawYouTubePlay(canvas, size);
        break;
      case 'kwitch':
        _drawTwitchBubble(canvas, size);
        break;
      default:
        _drawDefaultStore(canvas, size);
        break;
    }
  }

  /// Векторная нота TikTok (kTok)
  void _drawTikTokNote(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    final paint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Colors.white, KColors.lavInk, KColors.lav],
      ).createShader(Offset.zero & size)
      ..style = PaintingStyle.fill;

    final path = Path();
    path.moveTo(w * 0.42, h * 0.28);
    path.lineTo(w * 0.42, h * 0.62);
    // Основание ноты
    path.addOval(Rect.fromCenter(
      center: Offset(w * 0.35, h * 0.68),
      width: w * 0.28,
      height: h * 0.20,
    ));
    // Хвостик ноты вверх и вправо
    path.moveTo(w * 0.42, h * 0.28);
    path.cubicTo(
      w * 0.52, h * 0.28,
      w * 0.68, h * 0.36,
      w * 0.72, h * 0.48,
    );
    path.lineTo(w * 0.62, h * 0.48);
    path.cubicTo(
      w * 0.58, h * 0.38,
      w * 0.48, h * 0.34,
      w * 0.42, h * 0.34,
    );
    path.close();

    canvas.drawPath(path, paint);
  }

  /// Векторный самолетик Telegram (kGram) — идеальная каноничная геометрия с ровным сгибом
  void _drawTelegramPlane(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    final nose = Offset(w * 0.8125, h * 0.25);
    final leftTip = Offset(w * 0.203, h * 0.50);
    final creaseVertex = Offset(w * 0.461, h * 0.672);
    final rightTip = Offset(w * 0.695, h * 0.781);
    final finBottom = Offset(w * 0.363, h * 0.770);
    final finAttach = Offset(w * 0.344, h * 0.594);

    // Правое нижнее крыло (средний лавандовый тон)
    final rightWingPaint = Paint()
      ..color = const Color(0xFF9C89E8)
      ..style = PaintingStyle.fill;
    final rightWingPath = Path()
      ..moveTo(nose.dx, nose.dy)
      ..lineTo(rightTip.dx, rightTip.dy)
      ..lineTo(creaseVertex.dx, creaseVertex.dy)
      ..close();
    canvas.drawPath(rightWingPath, rightWingPaint);

    // Нижний киль (строго примыкает к вершине центрального сгиба)
    final finPaint = Paint()
      ..color = KColors.accBorder
      ..style = PaintingStyle.fill;
    final finPath = Path()
      ..moveTo(creaseVertex.dx, creaseVertex.dy)
      ..lineTo(finBottom.dx, finBottom.dy)
      ..lineTo(finAttach.dx, finAttach.dy)
      ..close();
    canvas.drawPath(finPath, finPaint);

    // Главное верхнее крыло (яркая чистая лаванда)
    final mainWingPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
        colors: [Colors.white, KColors.lavInk, KColors.lav],
      ).createShader(Offset.zero & size)
      ..style = PaintingStyle.fill;
    final mainWingPath = Path()
      ..moveTo(leftTip.dx, leftTip.dy)
      ..lineTo(nose.dx, nose.dy)
      ..lineTo(creaseVertex.dx, creaseVertex.dy)
      ..close();
    canvas.drawPath(mainWingPath, mainWingPaint);
  }

  /// Векторная кнопка воспроизведения YouTube (kTube)
  void _drawYouTubePlay(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    final basePaint = Paint()
      ..color = KColors.accBg
      ..style = PaintingStyle.fill;

    final borderPaint = Paint()
      ..color = KColors.accBorder
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;

    final playPaint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Colors.white, KColors.lavInk, KColors.lav],
      ).createShader(Offset.zero & size)
      ..style = PaintingStyle.fill;

    // Внешняя плашка экрана
    final screenRect = RRect.fromRectAndRadius(
      Rect.fromCenter(center: Offset(w / 2, h / 2), width: w * 0.64, height: h * 0.46),
      Radius.circular(w * 0.12),
    );
    canvas.drawRRect(screenRect, basePaint);
    canvas.drawRRect(screenRect, borderPaint);

    // Треугольник воспроизведения
    final playPath = Path()
      ..moveTo(w * 0.44, h * 0.38)
      ..lineTo(w * 0.62, h * 0.50)
      ..lineTo(w * 0.44, h * 0.62)
      ..close();

    canvas.drawPath(playPath, playPaint);
  }

  /// Векторный бабл Twitch (kWitch)
  void _drawTwitchBubble(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    final paint = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Colors.white, KColors.lavInk, KColors.lav],
      ).createShader(Offset.zero & size)
      ..style = PaintingStyle.fill;

    final bubblePath = Path()
      ..moveTo(w * 0.25, h * 0.26)
      ..lineTo(w * 0.75, h * 0.26)
      ..lineTo(w * 0.75, h * 0.64)
      ..lineTo(w * 0.62, h * 0.64)
      ..lineTo(w * 0.52, h * 0.76)
      ..lineTo(w * 0.52, h * 0.64)
      ..lineTo(w * 0.25, h * 0.64)
      ..close();

    canvas.drawPath(bubblePath, paint);

    // Глазки чата (вырезы)
    final eyePaint = Paint()
      ..color = const Color(0xFF0F0F12)
      ..style = PaintingStyle.fill;

    canvas.drawRect(Rect.fromLTWH(w * 0.40, h * 0.38, w * 0.07, h * 0.14), eyePaint);
    canvas.drawRect(Rect.fromLTWH(w * 0.54, h * 0.38, w * 0.07, h * 0.14), eyePaint);
  }

  /// Фирменный пакет kStore с буквой k
  void _drawDefaultStore(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    final lavenderShader = const LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: [Colors.white, KColors.lavInk, KColors.lav],
    ).createShader(Offset.zero & size);

    // Ручка пакета (дуга сверху)
    final handlePaint = Paint()
      ..shader = lavenderShader
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * 0.05
      ..strokeCap = StrokeCap.round;

    final handleRect = Rect.fromCenter(
      center: Offset(w * 0.50, h * 0.38),
      width: w * 0.26,
      height: h * 0.26,
    );
    canvas.drawArc(handleRect, 3.14159, 3.14159, false, handlePaint);

    // Корпус пакета
    final bagPaint = Paint()
      ..shader = lavenderShader
      ..style = PaintingStyle.fill;

    final bagRect = RRect.fromRectAndRadius(
      Rect.fromCenter(
        center: Offset(w * 0.50, h * 0.60),
        width: w * 0.52,
        height: h * 0.44,
      ),
      Radius.circular(w * 0.09),
    );
    canvas.drawRRect(bagRect, bagPaint);

    // Чистая, идеально читаемая буква K в центре пакета (Оникс #0A0A0C)
    final kPaint = Paint()
      ..color = const Color(0xFF0A0A0C)
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * 0.035
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final kPath = Path()
      ..moveTo(w * 0.43, h * 0.48)
      ..lineTo(w * 0.43, h * 0.72)
      ..moveTo(w * 0.58, h * 0.49)
      ..lineTo(w * 0.44, h * 0.60)
      ..moveTo(w * 0.495, h * 0.56)
      ..lineTo(w * 0.59, h * 0.71);

    canvas.drawPath(kPath, kPaint);
  }

  @override
  bool shouldRepaint(covariant _ModIconPainter oldDelegate) {
    return oldDelegate.modId != modId;
  }
}
