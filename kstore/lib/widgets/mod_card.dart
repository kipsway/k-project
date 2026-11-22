import 'package:flutter/material.dart';
import '../models/mod_item.dart';
import '../theme/colors.dart';
import '../theme/text_styles.dart';
import 'glass_container.dart';

/// Интерактивная карточка мода в каталоге kStore.
/// Реализует тактильную пружинную анимацию нажатия и
/// выдержана в правилах Material You 3 Expressive (скругление 24px, капсула 999px).
class ModCard extends StatefulWidget {
  final ModItem item;
  final VoidCallback? onCardTap;
  final VoidCallback? onActionTap;

  const ModCard({
    super.key,
    required this.item,
    this.onCardTap,
    this.onActionTap,
  });

  @override
  State<ModCard> createState() => _ModCardState();
}

class _ModCardState extends State<ModCard> with SingleTickerProviderStateMixin {
  late AnimationController _animController;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 100),
      reverseDuration: const Duration(milliseconds: 140),
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.97).animate(
      CurvedAnimation(parent: _animController, curve: Curves.easeInOutCubic),
    );
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails details) {
    _animController.forward();
  }

  void _onTapUp(TapUpDetails details) {
    _animController.reverse();
    widget.onCardTap?.call();
  }

  void _onTapCancel() {
    _animController.reverse();
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;

    return GestureDetector(
      onTapDown: _onTapDown,
      onTapUp: _onTapUp,
      onTapCancel: _onTapCancel,
      child: ScaleTransition(
        scale: _scaleAnimation,
        child: GlassContainer(
          borderRadius: BorderRadius.circular(24),
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // 1. Иконка мода 60x60 (радиус 16px)
              _buildModIcon(item),
              const SizedBox(width: 14),

              // 2. Блок информации
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Заголовок и бейдж автора
                    Row(
                      children: [
                        Text(item.name, style: KTextStyles.modTitle),
                        const SizedBox(width: 6),
                        Text(item.author, style: KTextStyles.authorBadge),
                      ],
                    ),
                    const SizedBox(width: 2),

                    // Описание в 2 строки
                    Text(
                      item.description,
                      style: KTextStyles.description,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 6),

                    // Мета-строка (рейтинг, версия, k-Tunnel)
                    Row(
                      children: [
                        const Icon(Icons.star_rounded, size: 14, color: KColors.lav),
                        const SizedBox(width: 2),
                        Text(item.rating.toStringAsFixed(1), style: KTextStyles.meta),
                        const SizedBox(width: 8),
                        Text('v${item.version}', style: KTextStyles.meta),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: KColors.cellOff,
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: KColors.borderWell, width: 0.5),
                          ),
                          child: Text(
                            item.tunnelFeature,
                            style: KTextStyles.meta.copyWith(color: KColors.lavInk, fontSize: 10),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),

              // 3. Кнопка-капсула действия (999px)
              _buildActionButton(item),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildModIcon(ModItem item) {
    return Container(
      width: 58,
      height: 58,
      decoration: BoxDecoration(
        color: KColors.cellOff,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: KColors.panelBorder, width: 1),
      ),
      clipBehavior: Clip.antiAlias,
      child: Image.asset(
        item.iconAsset,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) {
          // Запасная мозаичная заглушка с буквой названия
          return Container(
            color: KColors.accBg,
            alignment: Alignment.center,
            child: Text(
              item.name.substring(0, 1),
              style: const TextStyle(
                fontFamily: 'Montserrat',
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: KColors.lav,
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildActionButton(ModItem item) {
    if (item.hasUpdate) {
      // Кнопка «Обновить»
      return _buildCapsule(
        label: 'Обновить',
        bgColor: KColors.lav,
        textColor: KColors.bg,
        borderColor: null,
      );
    } else if (item.isInstalled) {
      // Кнопка «Установлено»
      return _buildCapsule(
        label: 'Установлено',
        bgColor: KColors.accBg,
        textColor: KColors.lavInk,
        borderColor: KColors.accBorder,
      );
    } else {
      // Кнопка «Установить»
      return _buildCapsule(
        label: 'Установить',
        bgColor: KColors.lav,
        textColor: KColors.bg,
        borderColor: null,
      );
    }
  }

  Widget _buildCapsule({
    required String label,
    required Color bgColor,
    required Color textColor,
    Color? borderColor,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: widget.onActionTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          height: 34,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(999),
            border: borderColor != null ? Border.all(color: borderColor, width: 1.2) : null,
          ),
          child: Text(
            label,
            style: KTextStyles.buttonCapsule.copyWith(color: textColor),
          ),
        ),
      ),
    );
  }
}
