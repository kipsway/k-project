import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/models/chat_user_profile.dart';

class UserCardSheet extends StatelessWidget {
  final ChatUserProfile user;
  final ValueChanged<ModActionType> onModAction;

  const UserCardSheet({
    super.key,
    required this.user,
    required this.onModAction,
  });

  static void show(
    BuildContext context, {
    required ChatUserProfile user,
    required ValueChanged<ModActionType> onModAction,
  }) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => UserCardSheet(
        user: user,
        onModAction: onModAction,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return KGlassContainer(
      borderRadius: 24,
      blurSigma: 24,
      backgroundColor: const Color(0xF20F0F12),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      margin: const EdgeInsets.all(12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Верхний хэндл
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: KColors.faint.withOpacity(0.5),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // ШАПКА ПРОФИЛЯ ЗРИТЕЛЯ
          Row(
            children: [
              // Аватар
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: KColors.cellOff,
                  border: Border.all(
                    color: user.hasNamePaint ? KColors.lav : KColors.panelBorder,
                    width: 1.5,
                  ),
                ),
                child: Center(
                  child: Text(
                    user.displayName.isNotEmpty ? user.displayName[0].toUpperCase() : '?',
                    style: KTypography.titleBold.copyWith(color: KColors.lavInk),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              // Имя с поддержкой Name Paints
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (user.hasNamePaint && user.paintColors != null)
                      ShaderMask(
                        shaderCallback: (bounds) => LinearGradient(
                          colors: user.paintColors!,
                        ).createShader(bounds),
                        child: Text(
                          user.displayName,
                          style: KTypography.titleBold.copyWith(color: Colors.white),
                        ),
                      )
                    else
                      Text(
                        user.displayName,
                        style: KTypography.titleBold.copyWith(color: user.userColor),
                      ),
                    const SizedBox(height: 2),
                    Text(
                      '@${user.username}',
                      style: KTypography.caption.copyWith(color: KColors.faint),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // БЕЙДЖИ ПОЛЬЗОВАТЕЛЯ
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: user.badges.map((badge) {
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: KColors.cellOff,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: KColors.panelBorder, width: 0.8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      badge == 'mod'
                          ? LucideIcons.shieldAlert
                          : (badge == 'vip' ? LucideIcons.gem : LucideIcons.star),
                      size: 12,
                      color: badge == 'mod' ? KColors.green : KColors.lav,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      badge.toUpperCase(),
                      style: KTypography.caption.copyWith(
                        fontSize: 10,
                        color: KColors.ink,
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),

          // БЫСТРЫЕ ДЕЙСТВИЯ МОДЕРАЦИИ (1-Click Mod Actions)
          Text(
            'Быстрые действия модерации',
            style: KTypography.sectionHeader.copyWith(fontSize: 13),
          ),
          const SizedBox(height: 10),

          Row(
            children: [
              // Упомянуть
              Expanded(
                child: _buildModActionButton(
                  context,
                  label: 'Упомянуть',
                  icon: LucideIcons.atSign,
                  color: KColors.lav,
                  action: ModActionType.mention,
                ),
              ),
              const SizedBox(width: 8),
              // Таймаут 10м
              Expanded(
                child: _buildModActionButton(
                  context,
                  label: '10 мин',
                  icon: LucideIcons.clock,
                  color: KColors.yellow,
                  action: ModActionType.timeout10m,
                ),
              ),
              const SizedBox(width: 8),
              // Таймаут 1ч
              Expanded(
                child: _buildModActionButton(
                  context,
                  label: '1 час',
                  icon: LucideIcons.timer,
                  color: KColors.yellow,
                  action: ModActionType.timeout1h,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          Row(
            children: [
              // Удалить сообщение
              Expanded(
                child: _buildModActionButton(
                  context,
                  label: 'Удалить сообщение',
                  icon: LucideIcons.trash2,
                  color: KColors.faint,
                  action: ModActionType.deleteMessage,
                ),
              ),
              const SizedBox(width: 8),
              // Бан
              Expanded(
                child: _buildModActionButton(
                  context,
                  label: 'Заблокировать (Бан)',
                  icon: LucideIcons.ban,
                  color: KColors.red,
                  isDestructive: true,
                  action: ModActionType.ban,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // ПОСЛЕДНИЕ СООБЩЕНИЯ
          if (user.recentMessages.isNotEmpty) ...[
            Text('Недавние сообщения:', style: KTypography.caption),
            const SizedBox(height: 6),
            ...user.recentMessages.take(3).map((msg) {
              return Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                margin: const EdgeInsets.only(bottom: 4),
                decoration: BoxDecoration(
                  color: KColors.well,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  msg,
                  style: KTypography.bodyMuted.copyWith(fontSize: 12),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              );
            }),
          ],
        ],
      ),
    );
  }

  Widget _buildModActionButton(
    BuildContext context, {
    required String label,
    required IconData icon,
    required Color color,
    required ModActionType action,
    bool isDestructive = false,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          HapticFeedback.mediumImpact();
          onModAction(action);
          Navigator.pop(context);
        },
        borderRadius: BorderRadius.circular(12),
        splashColor: color.withOpacity(0.15),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
          decoration: BoxDecoration(
            color: isDestructive ? KColors.red.withOpacity(0.12) : KColors.cellOff,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isDestructive ? KColors.red.withOpacity(0.4) : KColors.panelBorder,
              width: 1,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 14, color: color),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  style: KTypography.caption.copyWith(
                    fontSize: 11,
                    color: isDestructive ? KColors.redInk : KColors.ink,
                    fontWeight: isDestructive ? FontWeight.w700 : FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
