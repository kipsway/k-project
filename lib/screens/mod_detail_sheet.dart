import 'dart:ui';
import 'package:flutter/material.dart';
import '../models/mod_item.dart';
import '../theme/colors.dart';
import '../theme/text_styles.dart';
import '../widgets/glass_container.dart';

/// Шторка детальной информации о моде (Liquid Glass Bottom Sheet).
/// Открывается при нажатии на карточку мода в основном каталоге.
class ModDetailSheet extends StatelessWidget {
  final ModItem mod;
  final VoidCallback onActionTap;

  const ModDetailSheet({
    super.key,
    required this.mod,
    required this.onActionTap,
  });

  /// Статический метод для удобного показа шторки
  static Future<void> show(
    BuildContext context, {
    required ModItem mod,
    required VoidCallback onActionTap,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withOpacity(0.65),
      builder: (context) => ModDetailSheet(
        mod: mod,
        onActionTap: onActionTap,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    final features = _getModFeatures(mod.id);
    final changelog = _getModChangelog(mod.id);

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          height: screenHeight * 0.85,
          decoration: BoxDecoration(
            color: KColors.panel.withOpacity(0.92),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
            border: const Border(
              top: BorderSide(
                color: Color(0x38FFFFFF), // Верхний оптический линзовый блик
                width: 1.2,
              ),
            ),
          ),
          child: Column(
            children: [
              // Верхний хэндл перетаскивания и кнопка закрытия
              _buildTopBar(context),

              // Прокручиваемый контент
              Expanded(
                child: ListView(
                  physics: const BouncingScrollPhysics(),
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  children: [
                    // Шапка мода: иконка, название, рейтинг, бейджи
                    _buildHeader(),
                    const SizedBox(height: 20),

                    // Галерея скриншотов
                    _buildScreenshotGallery(),
                    const SizedBox(height: 24),

                    // Раздел: Ключевые возможности
                    _buildSectionTitle('Ключевые возможности'),
                    const SizedBox(height: 12),
                    ...features.map((feature) => _buildFeatureItem(feature)),
                    const SizedBox(height: 24),

                    // Раздел: Что нового
                    _buildSectionTitle('Что нового в v${mod.version}'),
                    const SizedBox(height: 12),
                    ...changelog.map((change) => _buildChangelogItem(change)),
                    const SizedBox(height: 32),
                  ],
                ),
              ),

              // Закрепленная снизу кнопка действия
              _buildBottomActionBar(context),
            ],
          ),
        ),
      ),
    );
  }

  /// Верхняя панель шторки
  Widget _buildTopBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 16, 8),
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Ручка шторки
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: KColors.faint.withOpacity(0.5),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          // Кнопка закрытия справа
          Align(
            alignment: Alignment.centerRight,
            child: GlassContainer(
              radius: 999,
              width: 32,
              height: 32,
              backgroundColor: KColors.cellOff.withOpacity(0.7),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () => Navigator.of(context).pop(),
                  borderRadius: BorderRadius.circular(999),
                  child: const Center(
                    child: Icon(
                      Icons.close_rounded,
                      size: 18,
                      color: KColors.muted,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Шапка карточки мода
  Widget _buildHeader() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Крупная иконка
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: KColors.cellOff,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: KColors.panelBorder, width: 1.0),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                KColors.accBg,
                KColors.cellOff,
              ],
            ),
          ),
          child: Center(
            child: Text(
              mod.name.isNotEmpty ? mod.name[0] : 'k',
              style: const TextStyle(
                fontFamily: KTextStyles.fontFamily,
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: KColors.lav,
              ),
            ),
          ),
        ),
        const SizedBox(width: 16),
        // Инфо
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                mod.name,
                style: const TextStyle(
                  fontFamily: KTextStyles.fontFamily,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: KColors.ink,
                  letterSpacing: -0.4,
                ),
              ),
              const SizedBox(height: 2),
              Text(mod.author, style: KTextStyles.author),
              const SizedBox(height: 8),
              // Бейджи
              Row(
                children: [
                  _buildBadge('v${mod.version}'),
                  const SizedBox(width: 8),
                  _buildBadge('APK ~45 МБ'),
                  const Spacer(),
                  Row(
                    children: [
                      const Icon(
                        Icons.star_rounded,
                        size: 18,
                        color: Color(0xFFFFB800),
                      ),
                      const SizedBox(width: 3),
                      Text(
                        mod.rating.toStringAsFixed(1),
                        style: KTextStyles.rating,
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildBadge(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: KColors.cellOff,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: KColors.panelBorder, width: 0.8),
      ),
      child: Text(text, style: KTextStyles.badge),
    );
  }

  /// Горизонтальная галерея скриншотов мода
  Widget _buildScreenshotGallery() {
    return SizedBox(
      height: 180,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: 4,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          return Container(
            width: 110,
            decoration: BoxDecoration(
              color: KColors.cellOff,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: KColors.panelBorder, width: 1.0),
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  KColors.panelBorder.withOpacity(0.5),
                  KColors.cellOff,
                ],
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.phone_android_rounded,
                  size: 32,
                  color: KColors.faint.withOpacity(0.6),
                ),
                const SizedBox(height: 8),
                Text(
                  'Экран ${index + 1}',
                  style: const TextStyle(
                    fontFamily: KTextStyles.fontFamily,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: KColors.muted,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontFamily: KTextStyles.fontFamily,
        fontSize: 16,
        fontWeight: FontWeight.w800,
        color: KColors.ink,
        letterSpacing: -0.2,
      ),
    );
  }

  Widget _buildFeatureItem(String feature) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 3),
            width: 16,
            height: 16,
            decoration: const BoxDecoration(
              color: KColors.accBg,
              shape: BoxShape.circle,
            ),
            child: const Center(
              child: Icon(
                Icons.check_rounded,
                size: 11,
                color: KColors.lav,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              feature,
              style: const TextStyle(
                fontFamily: KTextStyles.fontFamily,
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: KColors.ink,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChangelogItem(String change) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            '•',
            style: TextStyle(
              color: KColors.lav,
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              change,
              style: const TextStyle(
                fontFamily: KTextStyles.fontFamily,
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: KColors.muted,
                height: 1.35,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Закрепленная кнопка внизу шторки
  Widget _buildBottomActionBar(BuildContext context) {
    final isInstalled = mod.isInstalled;
    final hasUpdate = mod.hasUpdate;

    String label;
    IconData icon;
    Color bgColor;
    Color borderColor;
    Color textColor;
    Color iconColor;

    if (!isInstalled) {
      label = 'Установить APK';
      icon = Icons.download_rounded;
      bgColor = KColors.accBg;
      borderColor = KColors.accBorder;
      textColor = KColors.lavInk;
      iconColor = KColors.lav;
    } else if (hasUpdate) {
      label = 'Обновить версию';
      icon = Icons.arrow_upward_rounded;
      bgColor = KColors.accBg;
      borderColor = KColors.accBorder;
      textColor = KColors.lavInk;
      iconColor = KColors.lav;
    } else {
      label = 'Уже установлено';
      icon = Icons.check_circle_rounded;
      bgColor = KColors.cellOff;
      borderColor = KColors.panelBorder;
      textColor = KColors.ink;
      iconColor = KColors.green;
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      decoration: BoxDecoration(
        color: KColors.panel.withOpacity(0.95),
        border: const Border(
          top: BorderSide(color: KColors.panelBorder, width: 0.8),
        ),
      ),
      child: SizedBox(
        width: double.infinity,
        height: 52,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: () {
              Navigator.of(context).pop();
              onActionTap();
            },
            borderRadius: BorderRadius.circular(999),
            splashColor: KColors.lav.withOpacity(0.15),
            child: Ink(
              decoration: BoxDecoration(
                color: bgColor,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: borderColor, width: 1.2),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, size: 20, color: iconColor),
                  const SizedBox(width: 8),
                  Text(
                    label,
                    style: TextStyle(
                      fontFamily: KTextStyles.fontFamily,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: textColor,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Данные ключевых возможностей модов
  List<String> _getModFeatures(String id) {
    switch (id) {
      case 'ktok':
        return [
          'Скачивание любых видео без водяного знака в оригинальном качестве',
          'Смена региона ленты рекомендаций без извлечения SIM-карты',
          'Полное вырезание спонсорских роликов и рекламы',
          'Возможность скачивать только звуковую дорожку (mp3)',
        ];
      case 'kgram':
        return [
          'Встроенный k-Tunnel: мгновенный обход любых блокировок связи',
          'Плеер RX Playa с аппаратным ускорением и мгновенным откликом',
          'Запись и отправка видеосообщений (кружочков) в честном HD',
          'База на официальном клиенте Telegram 13.2.2',
        ];
      case 'ktube':
        return [
          'Встроенное ядро k-Tunnel: полный обход замедления YouTube в РФ',
          'Воспроизведение в 1080p / 4K 60fps без буферизации и рекламы',
          'Фоновое воспроизведение и режим «Картинка в картинке» (PiP)',
          'Интеграция SponsorBlock: пропуск спонсорских вставок в видео',
        ];
      case 'kwitch':
        return [
          'Встроенный чат Chatterino+ от Rish со смайлами 7TV, BTTV и FFZ',
          'Стриминг 1080p60 / 1440p без задержек через сетевой модуль k-Tunnel',
          'Поддержка кастомных бейджей и раскрасок ников (Name Paints)',
          'Энергоэффективный плеер с минимальным нагревом устройства',
        ];
      default:
        return ['Полная оптимизация под производительность и удобство'];
    }
  }

  /// Журнал изменений
  List<String> _getModChangelog(String id) {
    switch (id) {
      case 'ktok':
        return [
          'Обновление кодовой базы до актуальной версии TikTok 34.1.2',
          'Улучшен алгоритм вырезания рекламных баннеров в профилях',
          'Повышена стабильность скачивания длинных видеороликов',
        ];
      case 'kgram':
        return [
          'Синхронизация узлов k-Tunnel с автоматическим выбором лучшего пинга',
          'Оптимизирована буферизация в аудиоплеере RX Playa',
          'Исправлена плавность анимаций при переключении между чатами',
        ];
      case 'ktube':
        return [
          'Добавлены новые европейские узлы ускорения k-Tunnel',
          'Исправлен сброс качества на 360p при нестабильном сигнале',
          'Улучшена работа SponsorBlock при перемотке роликов',
        ];
      case 'kwitch':
        return [
          'Синхронизированы свежие стили палитры «Мозаика» от Rish',
          'Ускорено первичное подключение к WebSocket чата Twitch',
          'Добавлена поддержка анимированных бейджей подписчиков',
        ];
      default:
        return ['Исправления ошибок и повышение общей стабильности'];
    }
  }
}
