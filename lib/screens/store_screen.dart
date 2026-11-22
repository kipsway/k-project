import 'dart:async';
import 'package:flutter/material.dart';
import 'mod_detail_sheet.dart';
import 'search_modal.dart';
import 'downloads_view.dart';
import 'info_view.dart';
import '../models/mod_item.dart';
import '../theme/colors.dart';
import '../theme/text_styles.dart';
import '../widgets/floating_dock.dart';
import '../widgets/floating_progress_bar.dart';
import '../widgets/glass_container.dart';
import '../widgets/mod_card.dart';

/// Главный экран каталога kStore.
/// Архитектура: Монолитный чистый каталог без верхних табов и категорий,
/// парящий стеклянный док снизу и динамический бар загрузки.
class StoreScreen extends StatefulWidget {
  const StoreScreen({super.key});

  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> {
  int _selectedTabIndex = 0;

  // Активная загрузка
  String? _activeDownloadModId;
  String? _activeDownloadModName;
  double _downloadProgress = 0.0;
  Timer? _downloadTimer;

  // Каталог модов экосистемы kipsway
  late List<ModItem> _mods;

  @override
  void initState() {
    super.initState();
    _mods = const [
      ModItem(
        id: 'ktok',
        name: 'kTok',
        author: 'by kipsway',
        description:
            'Скачивание видео без водяного знака, свободная смена региона ленты и плагины ReVanced.',
        version: '34.1.2',
        rating: 4.9,
        iconPath: 'assets/icons/ktok.png',
        apkUrl: 'https://github.com/kipsway/kStore/releases/download/v34.1.2/kTok.apk',
        isInstalled: false,
        hasUpdate: false,
      ),
      ModItem(
        id: 'kgram',
        name: 'kGram',
        author: 'by kipsway',
        description:
            'Клиент Telegram на базе NimarkoGram. Встроенный обход блокировок k-Tunnel, плеер RX Playa и HD-кружочки.',
        version: '13.2.2',
        rating: 4.9,
        iconPath: 'assets/icons/kgram.png',
        apkUrl: 'https://github.com/kipsway/kStore/releases/download/v13.2.2/kGram.apk',
        isInstalled: true,
        hasUpdate: true,
      ),
      ModItem(
        id: 'ktube',
        name: 'kTube',
        author: 'by kipsway',
        description:
            'YouTube без рекламы и замедлений. Прямой обход DPI через встроенное ядро k-Tunnel, SponsorBlock и PiP.',
        version: '19.16.39',
        rating: 4.8,
        iconPath: 'assets/icons/ktube.png',
        apkUrl: 'https://github.com/kipsway/kStore/releases/download/v19.16.39/kTube.apk',
        isInstalled: false,
        hasUpdate: false,
      ),
      ModItem(
        id: 'kwitch',
        name: 'kWitch',
        author: 'by kipsway',
        description:
            'Twitch со встроенным движком чата Chatterino+ от Rish. Смайлы 7TV/BTTV/FFZ и стриминг 1440p без лагов.',
        version: '18.4.0',
        rating: 4.9,
        iconPath: 'assets/icons/kwitch.png',
        apkUrl: 'https://github.com/kipsway/kStore/releases/download/v18.4.0/kWitch.apk',
        isInstalled: true,
        hasUpdate: false,
      ),
    ];
  }

  @override
  void dispose() {
    _downloadTimer?.cancel();
    super.dispose();
  }

  void _startDownload(ModItem mod) {
    if (_activeDownloadModId != null) return;

    setState(() {
      _activeDownloadModId = mod.id;
      _activeDownloadModName = mod.name;
      _downloadProgress = 0.05;
    });

    _downloadTimer?.cancel();
    _downloadTimer = Timer.periodic(const Duration(milliseconds: 150), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }

      setState(() {
        _downloadProgress += 0.04;
        if (_downloadProgress >= 1.0) {
          timer.cancel();
          _activeDownloadModId = null;
          _activeDownloadModName = null;
          _downloadProgress = 0.0;

          // Обновляем статус мода в списке
          final index = _mods.indexWhere((m) => m.id == mod.id);
          if (index != -1) {
            _mods[index] = _mods[index].copyWith(
              isInstalled: true,
              hasUpdate: false,
            );
          }
        }
      });
    });
  }

  void _cancelDownload() {
    _downloadTimer?.cancel();
    setState(() {
      _activeDownloadModId = null;
      _activeDownloadModName = null;
      _downloadProgress = 0.0;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: KColors.bg,
      body: Stack(
        children: [
          // Основной контент экрана
          SafeArea(
            bottom: false,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Шапка экрана (Header)
                _buildHeader(),
                // Плавное переключение между экранами табов
                Expanded(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 240),
                    switchInCurve: Curves.easeOutCubic,
                    switchOutCurve: Curves.easeInCubic,
                    transitionBuilder: (child, animation) {
                      return FadeTransition(
                        opacity: animation,
                        child: SlideTransition(
                          position: Tween<Offset>(
                            begin: const Offset(0.0, 0.02),
                            end: Offset.zero,
                          ).animate(animation),
                          child: child,
                        ),
                      );
                    },
                    child: _buildCurrentTabContent(),
                  ),
                ),
              ],
            ),
          ),

          // Парящий слой: бар загрузки и навигационный док
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Парящий бар загрузки (если есть активный процесс)
                if (_activeDownloadModName != null) ...[
                  FloatingProgressBar(
                    modName: _activeDownloadModName!,
                    progress: _downloadProgress,
                    onCancel: _cancelDownload,
                  ),
                  const SizedBox(height: 12),
                ],
                // Парящий стеклянный док навигации
                FloatingDock(
                  selectedIndex: _selectedTabIndex,
                  onItemSelected: (index) {
                    setState(() => _selectedTabIndex = index);
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCurrentTabContent() {
    switch (_selectedTabIndex) {
      case 1:
        return DownloadsView(
          key: const ValueKey('downloads_tab'),
          mods: _mods,
          activeDownloadModName: _activeDownloadModName,
          downloadProgress: _downloadProgress,
          onCancelDownload: _cancelDownload,
          onInstallMod: (mod) {
            _startDownload(mod);
          },
        );
      case 2:
        return const InfoView(key: ValueKey('info_tab'));
      case 0:
      default:
        return _buildCatalogList();
    }
  }

  /// Список модов каталога
  Widget _buildCatalogList() {
    return ListView.separated(
      key: const ValueKey('catalog_tab'),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 130),
      physics: const BouncingScrollPhysics(),
      itemCount: _mods.length,
      separatorBuilder: (_, __) => const SizedBox(height: 16),
      itemBuilder: (context, index) {
        final mod = _mods[index];
        return ModCard(
          mod: mod,
          onTap: () {
            ModDetailSheet.show(
              context,
              mod: mod,
              onActionTap: () {
                if (!mod.isInstalled || mod.hasUpdate) {
                  _startDownload(mod);
                }
              },
            );
          },
          onActionTap: () {
            if (!mod.isInstalled || mod.hasUpdate) {
              _startDownload(mod);
            }
          },
        );
      },
    );
  }

  /// Шапка экрана по стандартам Material You 3
  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 12.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Заголовок kStore
          const Text(
            'kStore',
            style: KTextStyles.h1,
          ),
          // Стеклянные круглые кнопки поиска и настроек
          Row(
            children: [
              _buildRoundButton(
                icon: Icons.search_rounded,
                onTap: () {
                  SearchModal.show(
                    context,
                    allMods: _mods,
                    onInstallMod: (mod) {
                      if (!mod.isInstalled || mod.hasUpdate) {
                        _startDownload(mod);
                      }
                    },
                  );
                },
              ),
              const SizedBox(width: 10),
              _buildRoundButton(
                icon: Icons.settings_rounded,
                onTap: () {
                  // Открытие настроек kStore
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Круглая стеклянная кнопка (40x40)
  Widget _buildRoundButton({
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return GlassContainer(
      radius: 999.0,
      width: 40,
      height: 40,
      backgroundColor: KColors.cellOff.withOpacity(0.7),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          splashColor: KColors.lav.withOpacity(0.15),
          highlightColor: KColors.lav.withOpacity(0.06),
          child: Center(
            child: Icon(
              icon,
              size: 20,
              color: KColors.ink,
            ),
          ),
        ),
      ),
    );
  }
}
