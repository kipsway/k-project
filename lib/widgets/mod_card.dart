import 'package:flutter/material.dart';
import '../models/mod_item.dart';
import '../theme/colors.dart';
import '../theme/text_styles.dart';
import 'glass_container.dart';

/// Карточка мода в каталоге kStore.
/// Сочетает жидкое стекло, скругление сквиркла 24px, тактильную пружинную
/// анимацию нажатия и кнопки-капсулы по стандартам Material You 3.
class ModCard extends StatefulWidget {
  final ModItem mod;
  final VoidCallback? onTap;
  final VoidCallback? onActionTap;

  const ModCard({
    super.key,
    required this.mod,
    this.onTap,
    this.onActionTap,
  });

  @override
  State<ModCard> createState() => _ModCardState();
}

class _ModCardState extends State<ModCard> with SingleTickerProviderStateMixin {
  late final AnimationController _scaleController;
  late final Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _scaleController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 120),
      reverseDuration: const Duration(milliseconds: 180),
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.97).animate(
      CurvedAnimation(
        parent: _scaleController,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeOutQuad,
      ),
    );
  }

  @override
  void dispose() {
    _scaleController.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails details) => _scaleController.forward();
  void _onTapUp(TapUpDetails details) => _scaleController.reverse();
  void _onTapCancel() => _scaleController.reverse();

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      onTap: widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedBuilder(
        animation: _scaleAnimation,
        builder: (context, child) => Transform.scale(
          scale: _scaleAnimation.value,
          child: child,
        ),
        child: GlassContainer(
          radius: 24.0,
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Иконка мода
                  _buildIcon(),
                  const SizedBox(width: 14),
                  // Название, автор, бейдж и рейтинг
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              widget.mod.name,
                              style: KTextStyles.cardTitle,
                            ),
                            const SizedBox(width: 8),
                            // Бейдж версии
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: KColors.cellOff,
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                  color: KColors.panelBorder,
                                  width: 0.8,
                                ),
                              ),
                              child: Text(
                                'v${widget.mod.version}',
                                style: KTextStyles.badge,
                              ),
                            ),
                            const Spacer(),
                            // Рейтинг
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.star_rounded,
                                  size: 17,
                                  color: Color(0xFFFFB800),
                                ),
                                const SizedBox(width: 3),
                                Text(
                                  widget.mod.rating.toStringAsFixed(1),
                                  style: KTextStyles.rating,
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          widget.mod.author,
                          style: KTextStyles.author,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // Краткое описание мода
              Text(
                widget.mod.description,
                style: KTextStyles.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 14),
              // Нижняя панель с кнопкой-капсулой действия
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  _buildActionButton(),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Квадратная скругленная иконка мода (56x56)
  Widget _buildIcon() {
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        color: KColors.cellOff,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: KColors.panelBorder,
          width: 1.0,
        ),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            KColors.accBg.withOpacity(0.6),
            KColors.cellOff,
          ],
        ),
      ),
      child: Center(
        child: Text(
          widget.mod.name.isNotEmpty ? widget.mod.name[0] : 'k',
          style: const TextStyle(
            fontFamily: KTextStyles.fontFamily,
            fontSize: 24,
            fontWeight: FontWeight.w800,
            color: KColors.lav,
          ),
        ),
      ),
    );
  }

  /// Вытянутая кнопка-капсула (Material You 3 StadiumBorder 999px)
  Widget _buildActionButton() {
    final isInstalled = widget.mod.isInstalled;
    final hasUpdate = widget.mod.hasUpdate;

    String label;
    IconData icon;
    Color bgColor;
    Color borderColor;
    Color textColor;
    Color iconColor;

    if (!isInstalled) {
      label = 'Установить';
      icon = Icons.download_rounded;
      bgColor = KColors.accBg;
      borderColor = KColors.accBorder;
      textColor = KColors.lavInk;
      iconColor = KColors.lav;
    } else if (hasUpdate) {
      label = 'Обновить';
      icon = Icons.arrow_upward_rounded;
      bgColor = KColors.accBg;
      borderColor = KColors.accBorder;
      textColor = KColors.lavInk;
      iconColor = KColors.lav;
    } else {
      label = 'Установлено';
      icon = Icons.check_rounded;
      bgColor = KColors.cellOff;
      borderColor = KColors.panelBorder;
      textColor = KColors.ink;
      iconColor = KColors.green;
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: widget.onActionTap,
        borderRadius: BorderRadius.circular(999),
        splashColor: KColors.lav.withOpacity(0.12),
        highlightColor: KColors.lav.withOpacity(0.06),
        child: Ink(
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: borderColor, width: 1.2),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: iconColor),
              const SizedBox(width: 6),
              Text(
                label,
                style: isInstalled && !hasUpdate
                    ? KTextStyles.buttonInstalled
                    : KTextStyles.buttonAction,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
