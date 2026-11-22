import 'package:flutter/material.dart';
import '../models/mod_item.dart';
import '../theme/colors.dart';
import '../theme/text_styles.dart';
import '../widgets/glass_container.dart';

/// Экран «Загрузки» (2-й таб парящего дока kStore).
/// Отображает активные процессы скачивания APK и список установленных модов.
class DownloadsView extends StatelessWidget {
  final List<ModItem> mods;
  final String? activeDownloadModName;
  final double downloadProgress;
  final VoidCallback onCancelDownload;
  final void Function(ModItem mod) onInstallMod;

  const DownloadsView({
    super.key,
    required this.mods,
    this.activeDownloadModName,
    this.downloadProgress = 0.0,
    required this.onCancelDownload,
    required this.onInstallMod,
  });

  @override
  Widget build(BuildContext context) {
    final installedMods = mods.where((m) => m.isInstalled).toList();

    return ListView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 130),
      children: [
        // Сводка хранилища и состояния
        _buildSummaryCard(installedMods.length),
        const SizedBox(height: 16),

        // Активная загрузка (если есть)
        if (activeDownloadModName != null) ...[
          _buildActiveDownloadCard(),
          const SizedBox(height: 16),
        ],

        // Секция установленных приложений
        const Text(
          'Установленные моды',
          style: TextStyle(
            fontFamily: KTextStyles.fontFamily,
            fontSize: 16,
            fontWeight: FontWeight.w800,
            color: KColors.ink,
            letterSpacing: -0.2,
          ),
        ),
        const SizedBox(height: 12),

        if (installedMods.isEmpty)
          _buildEmptyInstalledState()
        else
          ...installedMods.map((mod) => Padding(
                padding: const EdgeInsets.only(bottom: 12.0),
                child: _buildInstalledModTile(mod),
              )),
      ],
    );
  }

  /// Карточка сводки хранилища
  Widget _buildSummaryCard(int count) {
    return GlassContainer(
      radius: 24.0,
      padding: const EdgeInsets.all(18.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildStatColumn('Установлено', '$count мода', KColors.lav),
          Container(width: 1, height: 36, color: KColors.panelBorder),
          _buildStatColumn('Хранилище', '~${count * 45} МБ', KColors.ink),
          Container(width: 1, height: 36, color: KColors.panelBorder),
          _buildStatColumn('k-Tunnel', 'Активен', KColors.green),
        ],
      ),
    );
  }

  Widget _buildStatColumn(String label, String value, Color valueColor) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontFamily: KTextStyles.fontFamily,
            fontSize: 15,
            fontWeight: FontWeight.w800,
            color: valueColor,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(
            fontFamily: KTextStyles.fontFamily,
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: KColors.muted,
          ),
        ),
      ],
    );
  }

  /// Карточка активного скачивания
  Widget _buildActiveDownloadCard() {
    final percent = (downloadProgress.clamp(0.0, 1.0) * 100).toInt();

    return GlassContainer(
      radius: 24.0,
      padding: const EdgeInsets.all(16.0),
      backgroundColor: KColors.accBg.withOpacity(0.5),
      borderGradient: const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          KColors.accBorder,
          Color(0x1F7E6FC4),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: const BoxDecoration(
                  color: KColors.accBg,
                  shape: BoxShape.circle,
                ),
                child: const Center(
                  child: Icon(
                    Icons.arrow_downward_rounded,
                    size: 18,
                    color: KColors.lav,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Скачивание $activeDownloadModName',
                      style: const TextStyle(
                        fontFamily: KTextStyles.fontFamily,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: KColors.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Выполняется загрузка APK • $percent%',
                      style: KTextStyles.description,
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: onCancelDownload,
                icon: const Icon(Icons.close_rounded, size: 20, color: KColors.muted),
                splashRadius: 20,
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: SizedBox(
              height: 4,
              child: LinearProgressIndicator(
                value: downloadProgress.clamp(0.0, 1.0),
                backgroundColor: KColors.cellOff,
                valueColor: const AlwaysStoppedAnimation<Color>(KColors.lav),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Элемент списка установленного мода
  Widget _buildInstalledModTile(ModItem mod) {
    return GlassContainer(
      radius: 20.0,
      padding: const EdgeInsets.all(14.0),
      child: Row(
        children: [
          // Мини-иконка
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: KColors.cellOff,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: KColors.panelBorder, width: 0.8),
            ),
            child: Center(
              child: Text(
                mod.name.isNotEmpty ? mod.name[0] : 'k',
                style: const TextStyle(
                  fontFamily: KTextStyles.fontFamily,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: KColors.lav,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Инфо
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      mod.name,
                      style: const TextStyle(
                        fontFamily: KTextStyles.fontFamily,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: KColors.ink,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: KColors.cellOff,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text('v${mod.version}', style: KTextStyles.badge),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  mod.hasUpdate ? 'Доступна новая версия' : 'Установлена последняя версия',
                  style: TextStyle(
                    fontFamily: KTextStyles.fontFamily,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: mod.hasUpdate ? KColors.lav : KColors.muted,
                  ),
                ),
              ],
            ),
          ),
          // Кнопка действия (Обновить или галочка)
          if (mod.hasUpdate)
            Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () => onInstallMod(mod),
                borderRadius: BorderRadius.circular(999),
                child: Ink(
                  decoration: BoxDecoration(
                    color: KColors.accBg,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: KColors.accBorder, width: 1.0),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.arrow_upward_rounded, size: 14, color: KColors.lav),
                      SizedBox(width: 4),
                      Text(
                        'Обновить',
                        style: TextStyle(
                          fontFamily: KTextStyles.fontFamily,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: KColors.lavInk,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            )
          else
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: KColors.cellOff,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: KColors.panelBorder, width: 0.8),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.check_rounded, size: 14, color: KColors.green),
                  SizedBox(width: 4),
                  Text(
                    'Готово',
                    style: TextStyle(
                      fontFamily: KTextStyles.fontFamily,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: KColors.ink,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildEmptyInstalledState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 32.0),
        child: Column(
          children: [
            Icon(Icons.inbox_rounded, size: 40, color: KColors.faint.withOpacity(0.5)),
            const SizedBox(height: 10),
            const Text(
              'Нет установленных модов',
              style: TextStyle(
                fontFamily: KTextStyles.fontFamily,
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: KColors.muted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
