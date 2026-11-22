import 'package:flutter/material.dart';
import '../theme/colors.dart';
import '../theme/text_styles.dart';
import '../widgets/glass_container.dart';
import '../widgets/mod_icon.dart';

/// Экран «Инфо» (3-й таб парящего дока kStore).
/// Отображает статус ядра k-Tunnel, информацию о версии и принципы проекта kipsway.
class InfoView extends StatelessWidget {
  const InfoView({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 130),
      children: [
        // Главная карточка kStore
        _buildHeroCard(),
        const SizedBox(height: 16),

        // Статус встроенного ядра k-Tunnel
        _buildTunnelStatusCard(),
        const SizedBox(height: 16),

        // Принципы экосистемы
        _buildPrinciplesCard(),
        const SizedBox(height: 16),

        // Копирайт и версия
        _buildFooter(),
      ],
    );
  }

  /// Главная карточка приложения
  Widget _buildHeroCard() {
    return GlassContainer(
      radius: 28.0,
      padding: const EdgeInsets.all(20.0),
      child: Column(
        children: [
          const ModIcon(
            modId: 'kstore',
            size: 72,
            radius: 22,
          ),
          const SizedBox(height: 14),
          const Text('kStore', style: KTextStyles.h1),
          const SizedBox(height: 2),
          const Text('by kipsway', style: KTextStyles.author),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: KColors.cellOff,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: KColors.panelBorder, width: 0.8),
            ),
            child: const Text('Версия 1.0.0 (сборка 102)', style: KTextStyles.badge),
          ),
          const SizedBox(height: 16),
          // Кнопка проверки обновлений стора
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () {
                // Проверка обновлений kStore
              },
              borderRadius: BorderRadius.circular(999),
              child: Ink(
                decoration: BoxDecoration(
                  color: KColors.accBg,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: KColors.accBorder, width: 1.0),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.refresh_rounded, size: 16, color: KColors.lav),
                    SizedBox(width: 8),
                    Text(
                      'Проверить обновления',
                      style: KTextStyles.buttonAction,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Карточка сетевого ядра k-Tunnel
  Widget _buildTunnelStatusCard() {
    return GlassContainer(
      radius: 24.0,
      padding: const EdgeInsets.all(18.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: const BoxDecoration(
                  color: KColors.green,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Color(0x663FB950),
                      blurRadius: 8,
                      spreadRadius: 2,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              const Text(
                'Сетевое ядро k-Tunnel',
                style: TextStyle(
                  fontFamily: KTextStyles.fontFamily,
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: KColors.ink,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: KColors.cellOff,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text('42 ms', style: KTextStyles.badge),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Text(
            'Встроенный механизм обхода замедления (DPI) и сетевых блокировок для kTube, kWitch и kGram. Не требует включения глобального VPN на смартфоне.',
            style: KTextStyles.description,
          ),
        ],
      ),
    );
  }

  /// Принципы экосистемы
  Widget _buildPrinciplesCard() {
    return GlassContainer(
      radius: 24.0,
      padding: const EdgeInsets.all(18.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Принципы проекта',
            style: TextStyle(
              fontFamily: KTextStyles.fontFamily,
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: KColors.ink,
            ),
          ),
          const SizedBox(height: 12),
          _buildPrincipleRow(
            icon: Icons.block_rounded,
            title: 'Без рекламы и мусора',
            subtitle: 'Никаких встроенных баннеров, спам-уведомлений и ссылок на каналы.',
          ),
          const SizedBox(height: 12),
          _buildPrincipleRow(
            icon: Icons.security_rounded,
            title: 'Чистые APK с одной подписью',
            subtitle: 'Все сборки подписаны личным ключом kipsway для безопасных обновлений.',
          ),
          const SizedBox(height: 12),
          _buildPrincipleRow(
            icon: Icons.speed_rounded,
            title: 'Максимальная скорость',
            subtitle: 'Видео в 4K и стримы 1440p без задержек и лагов.',
          ),
        ],
      ),
    );
  }

  Widget _buildPrincipleRow({
    required IconData icon,
    required String title,
    required String subtitle,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: KColors.cellOff,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: KColors.panelBorder, width: 0.8),
          ),
          child: Icon(icon, size: 16, color: KColors.lav),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontFamily: KTextStyles.fontFamily,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: KColors.ink,
                ),
              ),
              const SizedBox(height: 2),
              Text(subtitle, style: KTextStyles.description),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildFooter() {
    return const Center(
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: 8.0),
        child: Text(
          'Создано kipsway • 2026',
          style: TextStyle(
            fontFamily: KTextStyles.fontFamily,
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: KColors.faint,
          ),
        ),
      ),
    );
  }
}
