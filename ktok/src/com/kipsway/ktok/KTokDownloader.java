package com.kipsway.ktok;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Загрузчик медиа kTok (by kipsway).
 * Скачивание видео в исходном качестве без водяного знака TikTok
 * и извлечение аудиодорожки (.mp3).
 *
 * Поддержка Scoped Storage (Android 10 - 15+):
 * - Видео: папка Movies/kTok
 * - Аудио: папка Music/kTok
 */
public class KTokDownloader {

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());

    /**
     * Скачать видео без водяного знака
     * @param context контекст приложения
     * @param videoUrl чистая ссылка (play_addr)
     * @param videoId идентификатор ролика
     */
    public static void downloadCleanVideo(final Context context, final String videoUrl, final String videoId) {
        if (context == null || videoUrl == null || videoUrl.isEmpty()) {
            showToast(context, "Не удалось получить ссылку на видео");
            return;
        }

        showToast(context, "Сохраняем без знака…");

        EXECUTOR.execute(() -> {
            String fileName = "kTok_" + (videoId != null ? videoId : System.currentTimeMillis()) + ".mp4";
            boolean success = false;

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = context.getContentResolver();
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Video.Media.DISPLAY_NAME, fileName);
                    values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
                    values.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/kTok");
                    values.put(MediaStore.Video.Media.IS_PENDING, 1);

                    Uri collection = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                    Uri itemUri = resolver.insert(collection, values);

                    if (itemUri != null) {
                        try (OutputStream os = resolver.openOutputStream(itemUri)) {
                            success = downloadStream(videoUrl, os);
                        }

                        values.clear();
                        values.put(MediaStore.Video.Media.IS_PENDING, 0);
                        resolver.update(itemUri, values, null, null);
                    }
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "kTok");
                    if (!dir.exists()) dir.mkdirs();
                    File dest = new File(dir, fileName);
                    try (OutputStream os = new FileOutputStream(dest)) {
                        success = downloadStream(videoUrl, os);
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
                success = false;
            }

            final boolean isSuccess = success;
            MAIN_HANDLER.post(() -> {
                if (isSuccess) {
                    showToast(context, "Сохранено в галерею (Movies/kTok)");
                } else {
                    showToast(context, "Ошибка сохранения видео");
                }
            });
        });
    }

    /**
     * Скачать аудиодорожку ролика
     * @param context контекст приложения
     * @param audioUrl прямая ссылка на аудиопоток
     * @param title название трека
     */
    public static void downloadAudio(final Context context, final String audioUrl, final String title) {
        if (context == null || audioUrl == null || audioUrl.isEmpty()) {
            showToast(context, "Аудиодорожка недоступна");
            return;
        }

        showToast(context, "Сохраняем аудио…");

        EXECUTOR.execute(() -> {
            String safeTitle = (title != null && !title.trim().isEmpty())
                    ? title.replaceAll("[\\\\/:*?\"<>|]", "_")
                    : "kTok_Audio_" + System.currentTimeMillis();
            String fileName = safeTitle + ".mp3";
            boolean success = false;

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = context.getContentResolver();
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Audio.Media.DISPLAY_NAME, fileName);
                    values.put(MediaStore.Audio.Media.MIME_TYPE, "audio/mpeg");
                    values.put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/kTok");
                    values.put(MediaStore.Audio.Media.IS_PENDING, 1);

                    Uri collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                    Uri itemUri = resolver.insert(collection, values);

                    if (itemUri != null) {
                        try (OutputStream os = resolver.openOutputStream(itemUri)) {
                            success = downloadStream(audioUrl, os);
                        }

                        values.clear();
                        values.put(MediaStore.Audio.Media.IS_PENDING, 0);
                        resolver.update(itemUri, values, null, null);
                    }
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), "kTok");
                    if (!dir.exists()) dir.mkdirs();
                    File dest = new File(dir, fileName);
                    try (OutputStream os = new FileOutputStream(dest)) {
                        success = downloadStream(audioUrl, os);
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
                success = false;
            }

            final boolean isSuccess = success;
            MAIN_HANDLER.post(() -> {
                if (isSuccess) {
                    showToast(context, "Сохранено в музыку (Music/kTok)");
                } else {
                    showToast(context, "Ошибка сохранения аудио");
                }
            });
        });
    }

    private static boolean downloadStream(String sourceUrl, OutputStream os) {
        if (os == null) return false;
        HttpURLConnection conn = null;
        try {
            URL url = new URL(sourceUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36");
            conn.connect();

            if (conn.getResponseCode() != HttpURLConnection.HTTP_OK) {
                return false;
            }

            try (InputStream is = conn.getInputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = is.read(buffer)) != -1) {
                    os.write(buffer, 0, read);
                }
                os.flush();
                return true;
            }
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static void showToast(Context context, String message) {
        if (context == null) return;
        MAIN_HANDLER.post(() -> Toast.makeText(context, message, Toast.LENGTH_SHORT).show());
    }
}
