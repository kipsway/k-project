import 'package:flutter/material.dart';
import '../models/mod_item.dart';
import '../theme/colors.dart';
import '../theme/text_styles.dart';
import '../widgets/glass_container.dart';
import '../widgets/mod_card.dart';

/// Главный монолитный экран каталога kStore (by kipsway).
/// Не содержит лишних вкладок и мусорных фильтров — интерфейс чист и собран.
class StoreScreen extends StatefulWidget {
  const StoreScreen({super.key});

  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> {
  int _selectedDockIndex = 0;
  double? _downloadProgress = 0.65; // Демонстрационный прогресс активной загрузки
  String? _downloadingAppName = 'kTube';

  late List<ModItem> _mods;

  @override
  void initState() {
    super.initState();
    _mods = const [
      ModItem(
        id: 'ktube',
        name: 'kTube',
        author: 'by kipsway',
        description: 'YouTube без рекламы, со SponsorBlock и ядром k-Tunnel для 4K без буферизации.',
        version: '1.0.0',
        rating: 4.9,
        iconAsset: 'assets/ktube_icon.png',
        apkUrl: 'build/output/kTube-v1.0.0-kipsway-release.apk',
        isInstalled: false,
        hasUpdate: false,
        tunnelFeature: 'k-Tunnel 4K',
      ),
      ModItem(
        id: 'kwitch',
        name: 'kWitch',
        author: 'by kipsway',
        description: 'Twitch со встроенным чатом Chatterino+ от Rish и ускорением 1440p без лагов.',
        version: '1.0.0',
        rating: 4.9,
        iconAsset: 'assets/kwitch_icon.png',
        apkUrl: 'build/output/kWitch-v1.0.0-release.apk',
        isInstalled: false,
        hasUpdate: false,
        tunnelFeature: 'k-Tunnel 1440p',
      ),
      ModItem(
        id: 'kgram',
        name: 'kGram',
        author: 'by kipsway',
        description: 'Модификация Telegram на базе NimarkoGram с туннелем k-Tunnel и плеером RX Playa.',
        version: '13.2.2',
        rating: 4.9,
        iconAsset: 'assets/kgram_icon.png',
        apkUrl: 'build/output/kGram-v13.2.2-release.apk',
        isInstalled: true,
        hasUpdate: true,
        tunnelFeature: 'k-Tunnel MTProto',
      ),
      ModItem(
        id: 'ktok',
        name: 'kTok',
        author: 'by kipsway',
        description: 'TikTok без водяных знаков, с возможностью смены региона и фоновым звуком.',
        version: '34.0.0',
        rating: 4.8,
        iconAsset: 'assets/ktok_icon.png',
        apkUrl: 'build/output/kTok-v34.0.0-release.apk',
        isInstalled: true,
        hasUpdate: false,
        tunnelFeature: 'Region Bypass',
      ),
    ];
  }

  void _onActionTap(ModItem item) {
    setState(() {
      _downloadingAppName = item.name;
      _downloadProgress = 0.15;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: KColors.panel,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: KColors.panelBorder),
        ),
        content: Text(
          'Загрузка ${item.name} началась...',
          style: KTextStyles.description.copyWith(color: KColors.ink),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: KColors.bg,
      body: Stack(
        children: [
          // 1. Основной контент со скроллом
          SafeArea(
            bottom: false,
            child: CustomScrollView(
              physics: const BouncingScrollPhysics(),
              slivers: [
                // Шапка экрана
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('kStore', style: KTextStyles.screenTitle),
                            SizedBox(height: 2),
                            Text('by kipsway', style: KTextStyles.authorBadge),
                          ],
                        ),
                        Row(
                          children: [
                            _buildRoundGlassButton(
                              icon: Icons.search_rounded,
                              onTap: () {},
                            ),
                            const SizedBox(width: 10),
                            _buildRoundGlassButton(
                              icon: Icons.tune_rounded,
                              onTap: () {},
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),

                // Список карточек
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 130), // отступ под док
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (context, index) {
                        final item = _mods[index];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: ModCard(
                            item: item,
                            onActionTap: () => _onActionTap(item),
                          ),
                        );
                      },
                      childCount: _mods.length,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // 2. Парящий бар загрузки (Floating Progress Bar)
          if (_downloadProgress != null && _downloadingAppName != null)
            Positioned(
              left: 20,
              right: 20,
              bottom: 96,
              child: _buildFloatingProgressBar(),
            ),

          // 3. Парящий стеклянный док навигации (Floating Dock)
          Positioned(
            left: 24,
            right: 24,
            bottom: 24,
            child: _buildFloatingDock(),
          ),
        ],
      ),
    );
  }

  /// Круглая стеклянная кнопка шапки (Поиск, Настройки)
  Widget _buildRoundGlassButton({
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return GlassContainer(
      borderRadius: BorderRadius.circular(999),
      padding: EdgeInsets.zero,
      width: 44,
      height: 44,
      onTap: onTap,
      child: Center(
        child: Icon(icon, color: KColors.ink, size: 20),
      ),
    );
  }

  /// Парящий индикатор активной загрузки
  Widget _buildFloatingProgressBar() {
    final percent = ((_downloadProgress ?? 0) * 100).toInt();

    return GlassContainer(
      borderRadius: BorderRadius.circular(999),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      color: KColors.panel.withOpacity(0.92),
      child: Row(
        children: [
          const Icon(Icons.downloading_rounded, color: KColors.lav, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'Загрузка $_downloadingAppName: $percent%',
                      style: KTextStyles.floatingProgress,
                    ),
                    Text(
                      'k-Tunnel Fast',
                      style: KTextStyles.meta.copyWith(color: KColors.lav),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(
                    value: _downloadProgress,
                    minHeight: 4,
                    backgroundColor: KColors.cellOff,
                    valueColor: const AlwaysStoppedAnimation<Color>(KColors.lav),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Парящий стеклянный навбар со скруглением 32px
  Widget _buildFloatingDock() {
    return GlassContainer(
      borderRadius: BorderRadius.circular(32),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      color: KColors.glassSurface,
      height: 64,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildDockItem(
            index: 0,
            icon: Icons.grid_view_rounded,
            label: 'Каталог',
          ),
          _buildDockItem(
            index: 1,
            icon: Icons.download_rounded,
            label: 'Загрузки',
          ),
          _buildDockItem(
            index: 2,
            icon: Icons.info_outline_rounded,
            label: 'Инфо',
          ),
        ],
      ),
    );
  }

  Widget _buildDockItem({
    required int index,
    required IconData icon,
    required String label,
  }) {
    final isSelected = _selectedDockIndex == index;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        setState(() {
          _selectedDockIndex = index;
        });
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 22,
            color: isSelected ? KColors.lav : KColors.muted,
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontFamily: 'Montserrat',
              fontSize: 10,
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
              color: isSelected ? KColors.lav : KColors.faint,
            ),
          ),
        ],
      ),
    );
  }
}
