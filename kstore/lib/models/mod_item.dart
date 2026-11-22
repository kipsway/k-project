/// Модель элемента каталога kStore.
class ModItem {
  final String id;
  final String name;        // "kTube", "kTok", "kGram", "kWitch"
  final String author;      // "by kipsway"
  final String description; // Краткое описание в 2 строки
  final String version;     // "1.0.0"
  final double rating;      // 4.9
  final String iconAsset;   // Путь к ассету иконки
  final String apkUrl;      // Локальный путь или URL для скачивания APK
  final bool isInstalled;
  final bool hasUpdate;
  final String tunnelFeature; // Описание фичи k-Tunnel

  const ModItem({
    required this.id,
    required this.name,
    this.author = 'by kipsway',
    required this.description,
    required this.version,
    required this.rating,
    required this.iconAsset,
    required this.apkUrl,
    this.isInstalled = false,
    this.hasUpdate = false,
    this.tunnelFeature = 'k-Tunnel 4K',
  });

  ModItem copyWith({
    bool? isInstalled,
    bool? hasUpdate,
    String? version,
  }) {
    return ModItem(
      id: id,
      name: name,
      author: author,
      description: description,
      version: version ?? this.version,
      rating: rating,
      iconAsset: iconAsset,
      apkUrl: apkUrl,
      isInstalled: isInstalled ?? this.isInstalled,
      hasUpdate: hasUpdate ?? this.hasUpdate,
      tunnelFeature: tunnelFeature,
    );
  }
}
