import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../../../../core/theme/k_colors.dart';
import '../../../../core/theme/k_glass.dart';
import '../../../../core/theme/k_typography.dart';
import '../../domain/services/twitch_auth_service.dart';

/// Шторка авторизации учетной записи Twitch в kWitch.
/// Позволяет подключить реальный аккаунт по OAuth-токену, отображает
/// профиль, синхронизирует чат Chatterino+ и гарантирует анонимность трафика через k-Tunnel.
class TwitchAuthSheet extends StatefulWidget {
  final TwitchAuthService authService;

  const TwitchAuthSheet({
    super.key,
    required this.authService,
  });

  static void show(BuildContext context, TwitchAuthService authService) {
    HapticFeedback.lightImpact();
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => AnimatedBuilder(
        animation: authService,
        builder: (context, _) => TwitchAuthSheet(authService: authService),
      ),
    );
  }

  @override
  State<TwitchAuthSheet> createState() => _TwitchAuthSheetState();
}

class _TwitchAuthSheetState extends State<TwitchAuthSheet> {
  final _usernameController = TextEditingController();
  final _tokenController = TextEditingController();
  String? _errorMessage;

  @override
  void dispose() {
    _usernameController.dispose();
    _tokenController.dispose();
    super.dispose();
  }

  void _handleLogin() async {
    final username = _usernameController.text.trim();
    final token = _tokenController.text.trim();

    if (username.isEmpty || token.isEmpty) {
      setState(() => _errorMessage = 'Заполните никнейм и токен');
      return;
    }

    final success = await widget.authService.loginWithOAuthToken(
      token: token,
      username: username,
    );

    if (success) {
      HapticFeedback.mediumImpact();
      if (mounted) {
        Navigator.of(context).pop();
      }
    } else {
      setState(() => _errorMessage = 'Некорректный токен или ник');
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.authService.session;
    final isAuthed = widget.authService.isAuthenticated;

    return Container(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: KGlassContainer(
        borderRadius: 24,
        blurSigma: 24,
        backgroundColor: const Color(0xF20F0F12),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        margin: const EdgeInsets.all(12),
        child: SingleChildScrollView(
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
              const SizedBox(height: 14),

              // Заголовок
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: isAuthed ? KColors.accBg : KColors.well,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: isAuthed ? KColors.lav : KColors.panelBorder,
                        width: 1,
                      ),
                    ),
                    child: Icon(
                      isAuthed ? LucideIcons.userCheck : LucideIcons.user,
                      color: isAuthed ? KColors.lav : KColors.muted,
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isAuthed ? 'Учетная запись Twitch' : 'Вход в аккаунт Twitch',
                          style: KTypography.sheetTitle.copyWith(color: KColors.ink),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          isAuthed
                              ? 'Авторизован в Chatterino+ и k-Tunnel'
                              : 'Опциональный вход для своего ника в чате',
                          style: KTypography.caption.copyWith(color: KColors.muted),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              if (isAuthed) ...[
                // Профиль авторизованного пользователя
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: KColors.well,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: KColors.panelBorder, width: 0.8),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: KColors.lav, width: 1.5),
                          color: KColors.panel,
                        ),
                        child: ClipOval(
                          child: session.avatarUrl != null
                              ? Image.network(session.avatarUrl!, fit: BoxFit.cover)
                              : const Icon(LucideIcons.user, color: KColors.lav, size: 24),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Text(
                                  session.displayName,
                                  style: KTypography.bodySmall.copyWith(
                                    color: KColors.ink,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                  decoration: BoxDecoration(
                                    color: KColors.accBg,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    'Twitch Prime',
                                    style: KTypography.monoStats.copyWith(
                                      fontSize: 9,
                                      color: KColors.lavInk,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 3),
                            Text(
                              '@${session.username} • ${session.maskedToken}',
                              style: KTypography.caption.copyWith(color: KColors.muted),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Статус безопасности
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: KColors.well.withOpacity(0.5),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: KColors.panelBorder, width: 0.8),
                  ),
                  child: Row(
                    children: [
                      const Icon(LucideIcons.shieldCheck, size: 14, color: KColors.green),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Трансляция 1440p продолжает идти через анонимный туннель k-Tunnel.',
                          style: KTypography.caption.copyWith(
                            color: KColors.muted,
                            fontSize: 10.5,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Кнопка выхода
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () {
                      HapticFeedback.mediumImpact();
                      widget.authService.logout();
                    },
                    icon: const Icon(LucideIcons.logOut, size: 16),
                    label: const Text('Выйти из аккаунта'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: KColors.red,
                      side: const BorderSide(color: Color(0x66EF4444)),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
              ] else ...[
                // Форма входа по токену
                TextField(
                  controller: _usernameController,
                  style: KTypography.bodySmall.copyWith(color: KColors.ink),
                  decoration: InputDecoration(
                    labelText: 'Имя пользователя (Ник Twitch)',
                    labelStyle: KTypography.caption.copyWith(color: KColors.muted),
                    filled: true,
                    fillColor: KColors.well,
                    prefixIcon: const Icon(LucideIcons.user, size: 16, color: KColors.muted),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: KColors.panelBorder),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: KColors.lav),
                    ),
                  ),
                ),
                const SizedBox(height: 10),

                TextField(
                  controller: _tokenController,
                  obscureText: true,
                  style: KTypography.bodySmall.copyWith(color: KColors.ink),
                  decoration: InputDecoration(
                    labelText: 'OAuth токен (oauth:xxxx...)',
                    labelStyle: KTypography.caption.copyWith(color: KColors.muted),
                    filled: true,
                    fillColor: KColors.well,
                    prefixIcon: const Icon(LucideIcons.key, size: 16, color: KColors.muted),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: KColors.panelBorder),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: KColors.lav),
                    ),
                  ),
                ),

                if (_errorMessage != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    _errorMessage!,
                    style: KTypography.caption.copyWith(color: KColors.red),
                  ),
                ],
                const SizedBox(height: 14),

                // Кнопка входа
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _handleLogin,
                    icon: const Icon(LucideIcons.logIn, size: 16),
                    label: const Text('Подключить аккаунт'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: KColors.lav,
                      foregroundColor: const Color(0xFF16151D),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 10),

                // Тестовый 1-клик вход под разработчиком
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () {
                      HapticFeedback.mediumImpact();
                      widget.authService.loginWithDemoKipsway();
                      Navigator.of(context).pop();
                    },
                    icon: const Icon(LucideIcons.sparkles, size: 15),
                    label: const Text('Демо-вход как kipsway (Dev)'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: KColors.lav,
                      side: const BorderSide(color: KColors.accBorder),
                      padding: const EdgeInsets.symmetric(vertical: 11),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
