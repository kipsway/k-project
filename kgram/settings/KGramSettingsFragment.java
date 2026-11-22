package org.kipsway.kgram.settings;

import android.content.Context;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import org.kipsway.kgram.theme.MozaikThemeManager;

/**
 * Экран настроек «Настройки kGram» (by kipsway).
 * Спроектирован по правилам «Сделано человеком»:
 * - Только нативный вид Telegram/NimarkoGram
 * - Человеческий понятный русский язык
 * - Никаких сложных перегруженных аббревиатур
 */
public class KGramSettingsFragment {

    private final Context context;
    private LinearLayout contentContainer;

    public KGramSettingsFragment(Context context) {
        this.context = context;
    }

    public View createView() {
        ScrollView scrollView = new ScrollView(context);
        scrollView.setBackgroundColor(MozaikThemeManager.COLOR_BG_ONYX);

        contentContainer = new LinearLayout(context);
        contentContainer.setOrientation(LinearLayout.VERTICAL);
        contentContainer.setPadding(dp(16), dp(16), dp(16), dp(40));
        scrollView.addView(contentContainer);

        // 1. Брендированный заголовок раздела
        addHeaderView("kGram", "by kipsway • Версия 10.9.1 (NimarkoGram core)");

        // 2. Раздел: Оформление
        addSectionTitle("ОФОРМЛЕНИЕ");
        addToggleCell(
            "Цвета «Мозаика»",
            "Глубокий оникс #0A0A0C и акцентная лаванда #B8A7F0",
            KGramConfig.isMozaikTheme(context),
            (btn, isChecked) -> {
                KGramConfig.setMozaikTheme(context, isChecked);
                MozaikThemeManager.setMozaikThemeEnabled(context, isChecked);
            }
        );

        // 3. Раздел: Музыка и видео
        addSectionTitle("МУЗЫКА И ВИДЕО");
        addToggleCell(
            "Плеер RX Playa",
            "Полноэкранная крупная обложка, мягкое виньетирование и свайпы",
            KGramConfig.isRxPlayaEnabled(context),
            (btn, isChecked) -> KGramConfig.setRxPlayaEnabled(context, isChecked)
        );
        addToggleCell(
            "HD-видеосообщения",
            "Запись видеокружочков в высоком битрейте CameraX без сжатия",
            KGramConfig.isHdVideoNotesEnabled(context),
            (btn, isChecked) -> KGramConfig.setHdVideoNotesEnabled(context, isChecked)
        );

        // 4. Раздел: Приватность
        addSectionTitle("ПРИВАТНОСТЬ (NIMARKOGRAM)");
        addToggleCell(
            "Призрачный режим",
            "Не отмечать входящие сообщения прочитанными при открытии чата",
            KGramConfig.isGhostModeEnabled(context),
            (btn, isChecked) -> KGramConfig.setGhostModeEnabled(context, isChecked)
        );
        addToggleCell(
            "Скрыть набор текста",
            "Собеседники не видят индикатор «печатает...» в диалогах",
            KGramConfig.isHideTypingEnabled(context),
            (btn, isChecked) -> KGramConfig.setHideTypingEnabled(context, isChecked)
        );
        addToggleCell(
            "Сохранять удаленные сообщения",
            "Отображать сообщения, удаленные собеседником, со специальной меткой",
            KGramConfig.isKeepDeletedEnabled(context),
            (btn, isChecked) -> KGramConfig.setKeepDeletedEnabled(context, isChecked)
        );

        return scrollView;
    }

    private void addHeaderView(String title, String subtitle) {
        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(8), dp(8), dp(8), dp(20));

        TextView titleView = new TextView(context);
        titleView.setText(title);
        titleView.setTextSize(24);
        titleView.setTextColor(MozaikThemeManager.COLOR_INK);
        titleView.setTypeface(null, android.graphics.Typeface.BOLD);
        header.addView(titleView);

        TextView subView = new TextView(context);
        subView.setText(subtitle);
        subView.setTextSize(13);
        subView.setTextColor(MozaikThemeManager.COLOR_LAVENDER);
        header.addView(subView);

        contentContainer.addView(header);
    }

    private void addSectionTitle(String text) {
        TextView section = new TextView(context);
        section.setText(text);
        section.setTextSize(12);
        section.setTextColor(MozaikThemeManager.COLOR_MUTED);
        section.setPadding(dp(8), dp(18), dp(8), dp(8));
        contentContainer.addView(section);
    }

    private void addToggleCell(String title, String summary, boolean initialValue,
                               android.widget.CompoundButton.OnCheckedChangeListener listener) {
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setBackgroundColor(MozaikThemeManager.COLOR_PANEL);
        row.setPadding(dp(16), dp(14), dp(16), dp(14));

        LinearLayout textCol = new LinearLayout(context);
        textCol.setOrientation(LinearLayout.VERTICAL);

        TextView titleView = new TextView(context);
        titleView.setText(title);
        titleView.setTextSize(16);
        titleView.setTextColor(MozaikThemeManager.COLOR_INK);
        textCol.addView(titleView);

        TextView summaryView = new TextView(context);
        summaryView.setText(summary);
        summaryView.setTextSize(12);
        summaryView.setTextColor(MozaikThemeManager.COLOR_MUTED);
        summaryView.setPadding(0, dp(2), 0, 0);
        textCol.addView(summaryView);

        row.addView(textCol, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f));

        Switch toggle = new Switch(context);
        toggle.setChecked(initialValue);
        toggle.setOnCheckedChangeListener(listener);
        row.addView(toggle);

        contentContainer.addView(row);

        // Тонкий разделитель
        View divider = new View(context);
        divider.setBackgroundColor(MozaikThemeManager.COLOR_BORDER);
        contentContainer.addView(divider, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 1));
    }

    private int dp(float val) {
        return (int) Math.ceil(context.getResources().getDisplayMetrics().density * val);
    }
}
