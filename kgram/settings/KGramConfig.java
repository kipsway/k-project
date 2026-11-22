package org.kipsway.kgram.settings;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Конфигурация и единое хранилище настроек kGram (by kipsway).
 * Строгие правила «Сделано человеком»:
 * - Только нативные переключатели без визуального мусора
 * - Человеческий понятный русский язык
 */
public class KGramConfig {

    private static final String PREF_NAME = "kgram_preferences";

    // Ключи настроек
    public static final String KEY_MOZAIK_THEME = "pref_mozaik_theme";
    public static final String KEY_RX_PLAYA = "pref_rx_playa_player";
    public static final String KEY_KTUNNEL = "pref_ktunnel_acceleration";
    public static final String KEY_HD_VIDEO_NOTES = "pref_hd_video_notes";
    public static final String KEY_GHOST_MODE = "pref_ghost_mode";
    public static final String KEY_HIDE_TYPING = "pref_hide_typing";
    public static final String KEY_KEEP_DELETED = "pref_keep_deleted";

    private static SharedPreferences getPrefs(Context context) {
        return context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
    }

    // --- Оформление «Мозаика» ---
    public static boolean isMozaikTheme(Context context) {
        return getPrefs(context).getBoolean(KEY_MOZAIK_THEME, true);
    }

    public static void setMozaikTheme(Context context, boolean enabled) {
        getPrefs(context).edit().putBoolean(KEY_MOZAIK_THEME, enabled).apply();
    }

    // --- Аудиоплеер RX Playa ---
    public static boolean isRxPlayaEnabled(Context context) {
        return getPrefs(context).getBoolean(KEY_RX_PLAYA, true);
    }

    public static void setRxPlayaEnabled(Context context, boolean enabled) {
        getPrefs(context).edit().putBoolean(KEY_RX_PLAYA, enabled).apply();
    }

    // --- Сеть k-Tunnel ---
    public static boolean isKTunnelEnabled(Context context) {
        return getPrefs(context).getBoolean(KEY_KTUNNEL, true);
    }

    public static void setKTunnelEnabled(Context context, boolean enabled) {
        getPrefs(context).edit().putBoolean(KEY_KTUNNEL, enabled).apply();
    }

    // --- HD-видеосообщения ---
    public static boolean isHdVideoNotesEnabled(Context context) {
        return getPrefs(context).getBoolean(KEY_HD_VIDEO_NOTES, true);
    }

    public static void setHdVideoNotesEnabled(Context context, boolean enabled) {
        getPrefs(context).edit().putBoolean(KEY_HD_VIDEO_NOTES, enabled).apply();
    }

    // --- Призрачный режим ---
    public static boolean isGhostModeEnabled(Context context) {
        return getPrefs(context).getBoolean(KEY_GHOST_MODE, false);
    }

    public static void setGhostModeEnabled(Context context, boolean enabled) {
        getPrefs(context).edit().putBoolean(KEY_GHOST_MODE, enabled).apply();
    }

    // --- Скрыть статус набора текста ---
    public static boolean isHideTypingEnabled(Context context) {
        return getPrefs(context).getBoolean(KEY_HIDE_TYPING, false);
    }

    public static void setHideTypingEnabled(Context context, boolean enabled) {
        getPrefs(context).edit().putBoolean(KEY_HIDE_TYPING, enabled).apply();
    }

    // --- Сохранять удаленные сообщения ---
    public static boolean isKeepDeletedEnabled(Context context) {
        return getPrefs(context).getBoolean(KEY_KEEP_DELETED, true);
    }

    public static void setKeepDeletedEnabled(Context context, boolean enabled) {
        getPrefs(context).edit().putBoolean(KEY_KEEP_DELETED, enabled).apply();
    }
}
