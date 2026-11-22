import 'dart:async';
import 'dart:io';
import 'package:flutter/services.dart';

/// Сервис загрузки установочных пакетов APK и
/// вызова нативного Android PackageInstaller.
class InstallerService {
  static const MethodChannel _channel = MethodChannel('com.kipsway.kstore/installer');

  static final InstallerService _instance = InstallerService._internal();
  factory InstallerService() => _instance;
  InstallerService._internal();

  /// Проверяет, установлен ли пакет в системе Android.
  Future<bool> isPackageInstalled(String packageName) async {
    try {
      final bool? result = await _channel.invokeMethod<bool>('isPackageInstalled', {
        'packageName': packageName,
      });
      return result ?? false;
    } catch (_) {
      // Запасной fallback для платформ без реализации нативного канала
      return false;
    }
  }

  /// Скачивает APK с отслеживанием прогресса через Stream
  Stream<double> downloadApk({
    required String url,
    required String destinationPath,
  }) async* {
    final client = HttpClient();
    try {
      final request = await client.getUrl(Uri.parse(url));
      final response = await request.close();

      if (response.statusCode != HttpStatus.ok) {
        throw HttpException('Ошибка сервера: ${response.statusCode}');
      }

      final contentLength = response.contentLength;
      final file = File(destinationPath);
      final sink = file.openWrite();

      int receivedBytes = 0;

      await for (final chunk in response) {
        receivedBytes += chunk.length;
        sink.add(chunk);

        if (contentLength > 0) {
          final progress = receivedBytes / contentLength;
          yield progress;
        }
      }

      await sink.flush();
      await sink.close();
      yield 1.0;
    } finally {
      client.close();
    }
  }

  /// Запускает системный диалог установки APK через FileProvider
  Future<bool> triggerInstall(String apkFilePath) async {
    final file = File(apkFilePath);
    if (!await file.exists()) {
      return false;
    }

    try {
      final bool? success = await _channel.invokeMethod<bool>('installApk', {
        'filePath': apkFilePath,
      });
      return success ?? false;
    } catch (e) {
      // Fallback через командную строку Android/adb если доступно
      return false;
    }
  }
}
