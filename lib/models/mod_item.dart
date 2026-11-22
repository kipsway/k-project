/// Модель элемента каталога kStore
class ModItem {
  final String id;
  final String name; // "kTok", "kGram", "kTube", "kWitch"
  final String author; // "by kipsway"
  final String description; // Краткое описание в 2 строки
  final String version; // "2.3.0"
  final double rating; // 4.9
  final String iconPath; // Путь к иконке ассета или вектор
  final String apkUrl; // Ссылка на скачивание APK
  final bool isInstalled;
  final bool hasUpdate;

  const ModItem({
    required this.id,
    required this.name,
    this.author = 'by kipsway',
    required this.description,
    required this.version,
    required this.rating,
    required this.iconPath,
    required this.apkUrl,
    this.isInstalled = false,
    this.hasUpdate = false,
  });

  ModItem copyWith({
    String? id,
    String? name,
    String? author,
    String? description,
    String? version,
    double? rating,
    String? iconPath,
    String? apkUrl,
    bool? isInstalled,
    bool? hasUpdate,
  }) {
    return ModItem(
      id: id ?? this.id,
      name: name ?? this.name,
      author: author ?? this.author,
      description: description ?? this.description,
      version: version ?? this.version,
      rating: rating ?? this.rating,
      iconPath: iconPath ?? this.iconPath,
      apkUrl: apkUrl ?? this.apkUrl,
      isInstalled: isInstalled ?? this.isInstalled,
      hasUpdate: hasUpdate ?? this.hasUpdate,
    );
  }
}
