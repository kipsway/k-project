package org.kipsway.kgram.network;

import android.content.Context;
import org.kipsway.kgram.settings.KGramConfig;

/**
 * Менеджер сетевого ускорения k-Tunnel (by kipsway).
 * Управляет встроенным loopback-прокси туннелем ядра NimarkoGram/Telegram,
 * обеспечивая непрерывную связь при DPI-блокировках без необходимости внешних VPN.
 */
public class KTunnelManager {

    private static final String BYPASS_CONTROLLER_CLASS = "app.nimarkogram.messenger.wsbypass.WsBypassController";

    /**
     * Проверяет и инициализирует k-Tunnel при старте приложения.
     */
    public static void initOnStartup(Context context) {
        if (context == null) return;
        boolean enabled = KGramConfig.isKTunnelEnabled(context);
        if (enabled) {
            setKTunnelEnabled(context, true);
        }
    }

    /**
     * Включает или выключает ускорение k-Tunnel.
     */
    public static void setKTunnelEnabled(Context context, boolean enabled) {
        if (context != null) {
            KGramConfig.setKTunnelEnabled(context, enabled);
        }

        try {
            Class<?> clazz = Class.forName(BYPASS_CONTROLLER_CLASS);
            Object instance = clazz.getMethod("getInstance").invoke(null);
            clazz.getMethod("setEnabled", boolean.class).invoke(instance, enabled);
            if (enabled) {
                clazz.getMethod("ensureStarted").invoke(instance);
            } else {
                clazz.getMethod("stop").invoke(instance);
            }
        } catch (Throwable t) {
            // Log fallback when tested outside of target runtime
            t.printStackTrace();
        }
    }

    /**
     * Возвращает текущее состояние туннеля k-Tunnel для отображения в UI.
     */
    public static String getStatusDescription(Context context) {
        if (!KGramConfig.isKTunnelEnabled(context)) {
            return "Отключено";
        }

        try {
            Class<?> clazz = Class.forName(BYPASS_CONTROLLER_CLASS);
            Object instance = clazz.getMethod("getInstance").invoke(null);
            String state = (String) clazz.getMethod("getState").invoke(instance);

            if ("running".equals(state)) {
                return "Активно • Связь стабильна";
            } else if ("starting".equals(state)) {
                return "Подключение...";
            } else if ("vpn".equals(state)) {
                return "Приостановлено (активен системный VPN)";
            } else if ("failed".equals(state)) {
                return "Сбой подключения (повтор...)";
            }
        } catch (Throwable ignored) {}

        return "Активно";
    }
}
