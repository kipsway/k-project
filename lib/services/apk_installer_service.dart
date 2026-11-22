import 'dart:async';
import 'dart:io';
import 'package:flutter/services.dart';

/// Статус процесса загрузки и установки APK
enum InstallState {
  idle,
  downloading,
  verifying,
  readyToInstall,
  installing,
  success,
  error,
}

/// Модель состояния установки
class InstallStatus {
  final InstallState state;
  final double progress; // 0.0 .. 1.0
  final String? errorMessage;
  final String? apkPath;

  const InstallStatus({
    required this.state,
    this.progress = 0.0,
    this.errorMessage,
    this.apkPath,
  });

  factory InstallStatus.idle() => const InstallStatus(state: InstallState.idle);
}

/// Сервис загрузки и вызова системного PackageInstaller на Android
class ApkInstallerService {
  static const MethodChannel _channel = MethodChannel('com.kipsway.kstore/installer');

  HttpClient? _httpClient;
  bool _isCancelled = false;

  /// Скачивание APK-файла с потоковым отчетом о прогрессе
  Future<File?> downloadApk({
    required String url,
    required String fileName,
    required void Function(double progress) onProgress,
  }) async {
    _isCancelled = false;
    _httpClient = HttpClient();

    try {
      final uri = Uri.parse(url);
      final request = await _httpClient!.getUrl(uri);
      final response = await request.close();

      if (response.statusCode != HttpStatus.ok) {
        throw HttpException('Ошибка сервера: код ${response.statusCode}');
      }

      final contentLength = response.contentLength;
      
      // Путь для сохранения во временную директорию приложения
      final tempDir = Directory.systemTemp;
      final file = File('${tempDir.path}/$fileName');
      if (await file.exists()) {
        await file.delete();
      }

      final sink = file.openWrite();
      int receivedBytes = 0;

      await for (final chunk in response) {
        if (_isCancelled) {
          await sink.close();
          if (await file.exists()) await file.delete();
          return null;
        }

        sink.add(chunk);
        receivedBytes += chunk.length;

        if (contentLength > 0) {
          final progress = receivedBytes / contentLength;
          onProgress(progress.clamp(0.0, 1.0));
        }
      }

      await sink.flush();
      await sink.close();

      return file;
    } catch (e) {
      if (_isCancelled) return null;
      rethrow;
    } finally {
      _httpClient?.close(force: true);
      _httpClient = null;
    }
  }

  /// Отмена текущей загрузки
  void cancelDownload() {
    _isCancelled = true;
    _httpClient?.close(force: true);
    _httpClient = null;
  }

  /// Запуск системного установщика Android (PackageInstaller) через Intent
  Future<bool> installApk(String filePath) async {
    final file = File(filePath);
    if (!await file.exists()) {
      throw const FileSystemException('APK-файл не найден на устройстве');
    }

    try {
      // Вызов нативного метода через платформенный канал
      final bool? result = await _channel.invokeMethod<bool>('installApk', {
        'filePath': filePath,
      });
      return result ?? false;
    } on PlatformException catch (e) {
      // Обработка отсутствия разрешения на установку из неизвестных источников
      if (e.code == 'PERMISSION_DENIED') {
        throw const PermissionException(
          'Разрешите установку приложений для kStore в настройках телефона',
        );
      }
      throw Exception('Не удалось запустить установщик: ${e.message}');
    } on MissingPluginException {
      // Фолбэк для демонстрации или отладки без нативной сборки
      return false;
    }
  }

  /// Проверка прав на установку приложений из внешних источников (Android 8.0+)
  Future<bool> canRequestPackageInstalls() async {
    try {
      final bool? allowed = await _channel.invokeMethod<bool>('canRequestPackageInstalls');
      return allowed ?? true;
    } catch (_) {
      return true;
    }
  }

  /// Открытие настроек разрешения на установку
  Future<void> openInstallPermissionSettings() async {
    try {
      await _channel.invokeMethod('openInstallPermissionSettings');
    } catch (_) {}
  }
}

/// Исключение при отказе в правах на установку
class PermissionException implements Exception {
  final String message;
  const PermissionException(this.message);

  @override
  String toString() => message;
}
