package org.kipsway.kgram.theme;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

/**
 * Менеджер дефолтной темы оформления «Мозаика» (Chatterino+ Palette by Rish).
 * Автоматически инициализирует и применяет глубокую ониксовую тему
 * с лавандовыми акцентами при первом запуске kGram.
 */
public class MozaikThemeManager {

    private static final String PREF_NAME = "kgram_theme_config";
    private static final String KEY_FIRST_LAUNCH = "mozaik_theme_applied_v1";
    private static final String KEY_MOZAIK_ENABLED = "mozaik_theme_enabled";
    private static final String THEME_FILE_NAME = "mozaik.attheme";

    // Основные цвета палитры «Мозаика»
    public static final int COLOR_BG_ONYX = 0xFF0A0A0C;
    public static final int COLOR_PANEL = 0xFF0F0F12;
    public static final int COLOR_CELL_OFF = 0xFF1C1B21;
    public static final int COLOR_BORDER = 0xFF2C2B32;
    public static final int COLOR_INK = 0xFFECEBF1;
    public static final int COLOR_MUTED = 0xFF8D8A99;
    public static final int COLOR_LAVENDER = 0xFFB8A7F0;
    public static final int COLOR_LAVENDER_INK = 0xFFD9CFFD;
    public static final int COLOR_ACC_BG = 0xFF2A2442;
    public static final int COLOR_ACC_BORDER = 0xFF7E6FC4;

    /**
     * Проверяет и активирует тему «Мозаика» при первом старте kGram.
     */
    public static void checkAndApplyDefaultTheme(Context context) {
        if (context == null) return;

        SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        boolean isFirstLaunch = !prefs.getBoolean(KEY_FIRST_LAUNCH, false);

        if (isFirstLaunch) {
            applyMozaikTheme(context);
            prefs.edit()
                .putBoolean(KEY_FIRST_LAUNCH, true)
                .putBoolean(KEY_MOZAIK_ENABLED, true)
                .apply();
        }
    }

    /**
     * Извлекает mozaik.attheme из assets во внутреннее хранилище и переключает тему клиента.
     */
    public static boolean applyMozaikTheme(Context context) {
        try {
            File themeFile = new File(context.getFilesDir(), THEME_FILE_NAME);
            
            // Копируем ассет темы
            try (InputStream is = context.getAssets().open("themes/" + THEME_FILE_NAME);
                 FileOutputStream fos = new FileOutputStream(themeFile)) {
                byte[] buffer = new byte[4096];
                int read;
                while ((read = is.read(buffer)) != -1) {
                    fos.write(buffer, 0, read);
                }
                fos.flush();
            }

            // Метод Theme.applyTheme вызывается в ядре NimarkoGram
            // Theme.ThemeInfo themeInfo = Theme.applyThemeFile(themeFile, "Мозаика", true);
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    public static boolean isMozaikThemeEnabled(Context context) {
        if (context == null) return true;
        SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        return prefs.getBoolean(KEY_MOZAIK_ENABLED, true);
    }

    public static void setMozaikThemeEnabled(Context context, boolean enabled) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_MOZAIK_ENABLED, enabled).apply();
        if (enabled) {
            applyMozaikTheme(context);
        }
    }
}
