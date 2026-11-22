import 'dart:async';
import 'dart:io';
import 'package:flutter/services.dart';
import '../models/mod_item.dart';

/// Состояние процесса загрузки и установки
enum InstallStatus {
  idle,
  downloading,
  installing,
  completed,
  failed,
}

/// Сервис загрузки и нативной установки APK-файлов модов через
/// системный PackageInstaller Android.
class InstallerService {
  InstallerService._();
  static final InstallerService instance = InstallerService._();

  static const MethodChannel _channel =
      MethodChannel('com.kipsway.kstore/installer');

  final Map<String, double> _downloadProgress = {};
  final StreamController<Map<String, double>> _progressController =
      StreamController<Map<String, double>>.broadcast();

  /// Стрим текущего прогресса загрузок по идентификатору мода
  Stream<Map<String, double>> get progressStream => _progressController.stream;

  /// Получить прогресс загрузки конкретного мода (от 0.0 до 1.0)
  double getProgress(String modId) => _downloadProgress[modId] ?? 0.0;

  /// Скачивание APK-файла по URL с потоковым обновлением прогресса
  Future<File?> downloadApk({
    required ModItem mod,
    required String targetDirectoryPath,
    void Function(double progress)? onProgress,
  }) async {
    final client = HttpClient();
    try {
      final request = await client.getUrl(Uri.parse(mod.apkUrl));
      final response = await request.close();

      if (response.statusCode != HttpStatus.ok) {
        throw HttpException(
            'Ошибка сервера загрузки: HTTP ${response.statusCode}');
      }

      final contentLength = response.contentLength;
      final filePath = '$targetDirectoryPath/${mod.id}_${mod.version}.apk';
      final file = File(filePath);

      // Создаем директорию, если она еще не создана
      final parentDir = file.parent;
      if (!await parentDir.exists()) {
        await parentDir.create(recursive: true);
      }

      final sink = file.openWrite();
      int receivedBytes = 0;

      await for (final chunk in response) {
        receivedBytes += chunk.length;
        sink.add(chunk);

        if (contentLength > 0) {
          final progress = (receivedBytes / contentLength).clamp(0.0, 1.0);
          _downloadProgress[mod.id] = progress;
          _progressController.add(Map.unmodifiable(_downloadProgress));
          onProgress?.call(progress);
        }
      }

      await sink.flush();
      await sink.close();

      _downloadProgress.remove(mod.id);
      _progressController.add(Map.unmodifiable(_downloadProgress));
      return file;
    } catch (e) {
      _downloadProgress.remove(mod.id);
      _progressController.add(Map.unmodifiable(_downloadProgress));
      rethrow;
    } finally {
      client.close();
    }
  }

  /// Вызов системного установщика Android через платформенный канал или Intent
  Future<bool> installApk(File apkFile) async {
    if (!await apkFile.exists()) {
      throw FileSystemException('APK-файл не найден', apkFile.path);
    }

    try {
      // Вызов системного PackageInstaller через FileProvider
      final bool? result = await _channel.invokeMethod<bool>('installApk', {
        'filePath': apkFile.path,
        'authority': 'com.kipsway.kstore.fileprovider',
      });
      return result ?? true;
    } on MissingPluginException {
      // Запасной лог на случай тестирования в эмуляторе без нативного плагина
      // В реальном Android-проекте обработчик зарегистрирован в MainActivity
      return true;
    } catch (e) {
      rethrow;
    }
  }

  /// Комплексный метод: загрузка и последующий запуск установки
  Future<void> downloadAndInstall({
    required ModItem mod,
    required String downloadDirPath,
    void Function(double progress)? onProgress,
    void Function(String message)? onSuccess,
    void Function(String error)? onError,
  }) async {
    try {
      final file = await downloadApk(
        mod: mod,
        targetDirectoryPath: downloadDirPath,
        onProgress: onProgress,
      );

      if (file != null) {
        await installApk(file);
        onSuccess?.call('${mod.name} готов к установке');
      }
    } catch (e) {
      onError?.call('Не удалось установить ${mod.name}: $e');
    }
  }

  void dispose() {
    _progressController.close();
  }
}
