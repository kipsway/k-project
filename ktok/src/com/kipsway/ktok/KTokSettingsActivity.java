package com.kipsway.ktok;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CompoundButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;

/**
 * Главный экран «Настройки kTok» (by kipsway).
 * Спроектирован по дизайн-системе «Мозаика»:
 * - Фон: глубокий оникс #0A0A0C
 * - Карточки: графит #0F0F12 со скруглением 20dp
 * - Акценты: чистый лавандовый цвет #B8A7F0
 * - Человеческий русский язык без сложных аббревиатур
 */
public class KTokSettingsActivity extends Activity {

    private static final String PREF_NAME = "ktok_preferences";

    // Ключи настроек
    public static final String KEY_CLEAN_DOWNLOAD = "ktok_clean_download";
    public static final String KEY_REMOVE_OUTRO = "ktok_remove_outro";
    public static final String KEY_BLOCK_ADS = "ktok_block_ads";
    public static final String KEY_MOZAIK_THEME = "ktok_mozaik_theme";
    public static final String KEY_SELECTED_REGION = "ktok_selected_region";

    // Цвета «Мозаика»
    private static final int COLOR_BG = 0xFF0A0A0C;
    private static final int COLOR_PANEL = 0xFF0F0F12;
    private static final int COLOR_BORDER = 0xFF2C2B32;
    private static final int COLOR_INK = 0xFFECEBF1;
    private static final int COLOR_MUTED = 0xFF8D8A99;
    private static final int COLOR_LAVENDER = 0xFFB8A7F0;
    private static final int COLOR_ACC_BORDER = 0xFF7E6FC4;

    private SharedPreferences prefs;
    private TextView regionSubtitleView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);

        ScrollView scrollView = new ScrollView(this);
        scrollView.setBackgroundColor(COLOR_BG);
        scrollView.setVerticalScrollBarEnabled(false);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20), dp(24), dp(20), dp(40));
        scrollView.addView(content);

        // 1. Шапка экрана
        buildHeader(content);

        // 2. Раздел: Регион ленты
        buildSectionTitle(content, "РЕГИОН ЛЕНТЫ");
        buildRegionCard(content);

        // 3. Раздел: Скачивание без знака
        buildSectionTitle(content, "СКАЧИВАНИЕ");
        buildToggleCard(
            content,
            "Скачивать без знака",
            "Сохранение видео в максимальном исходном качестве",
            KEY_CLEAN_DOWNLOAD,
            true
        );
        buildToggleCard(
            content,
            "Удалять заставку в конце",
            "Отрезать анимированный логотип TikTok в конце ролика",
            KEY_REMOVE_OUTRO,
            true
        );
        buildInfoCard(content, "Папка для видео", "Movies/kTok (напрямую в галерею)");
        buildInfoCard(content, "Папка для аудио", "Music/kTok (.mp3 треки)");

        // 4. Раздел: Реклама
        buildSectionTitle(content, "ЧИСТАЯ ЛЕНТА");
        buildToggleCard(
            content,
            "Скрыть рекламу в ленте",
            "Полная очистка ленты рекомендаций от рекламных роликов",
            KEY_BLOCK_ADS,
            true
        );

        // 5. Раздел: Оформление
        buildSectionTitle(content, "ОФОРМЛЕНИЕ");
        buildToggleCard(
            content,
            "Палитра «Мозаика»",
            "Глубокий черный фон #0A0A0C и акцентная лаванда #B8A7F0",
            KEY_MOZAIK_THEME,
            true
        );

        setContentView(scrollView);
    }

    private void buildHeader(LinearLayout parent) {
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(0, 0, 0, dp(24));

        // Кнопка «Назад»
        TextView backBtn = new TextView(this);
        backBtn.setText("←");
        backBtn.setTextSize(24);
        backBtn.setTextColor(COLOR_INK);
        backBtn.setPadding(0, 0, dp(16), 0);
        backBtn.setOnClickListener(v -> finish());
        header.addView(backBtn);

        LinearLayout textCol = new LinearLayout(this);
        textCol.setOrientation(LinearLayout.VERTICAL);

        TextView title = new TextView(this);
        title.setText("Настройки kTok");
        title.setTextSize(24);
        title.setTextColor(COLOR_INK);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        textCol.addView(title);

        TextView author = new TextView(this);
        author.setText("by kipsway • Версия 34.0.0");
        author.setTextSize(12);
        author.setTextColor(COLOR_LAVENDER);
        textCol.addView(author);

        header.addView(textCol);
        parent.addView(header);
    }

    private void buildSectionTitle(LinearLayout parent, String text) {
        TextView title = new TextView(this);
        title.setText(text);
        title.setTextSize(11);
        title.setTextColor(COLOR_MUTED);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        title.setPadding(dp(8), dp(20), dp(8), dp(8));
        parent.addView(title);
    }

    private void buildRegionCard(LinearLayout parent) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(16), dp(16), dp(16), dp(16));
        card.setBackground(createCardBg());

        LinearLayout textCol = new LinearLayout(this);
        textCol.setOrientation(LinearLayout.VERTICAL);

        TextView title = new TextView(this);
        title.setText("Сменить регион");
        title.setTextSize(16);
        title.setTextColor(COLOR_INK);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        textCol.addView(title);

        String currentCode = prefs.getString(KEY_SELECTED_REGION, "US");
        regionSubtitleView = new TextView(this);
        regionSubtitleView.setText("Текущий регион: " + currentCode + " (Нажмите для смены)");
        regionSubtitleView.setTextSize(12);
        regionSubtitleView.setTextColor(COLOR_LAVENDER);
        regionSubtitleView.setPadding(0, dp(2), 0, 0);
        textCol.addView(regionSubtitleView);

        card.addView(textCol, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f));

        TextView arrow = new TextView(this);
        arrow.setText("›");
        arrow.setTextSize(22);
        arrow.setTextColor(COLOR_MUTED);
        card.addView(arrow);

        card.setOnClickListener(v -> {
            KTokRegionDialog dialog = new KTokRegionDialog(this, (code, name) -> {
                regionSubtitleView.setText("Текущий регион: " + name);
            });
            dialog.show();
        });

        parent.addView(card);
    }

    private void buildToggleCard(LinearLayout parent, String titleText, String summaryText,
                                String prefKey, boolean defaultValue) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        card.setBackground(createCardBg());

        LinearLayout textCol = new LinearLayout(this);
        textCol.setOrientation(LinearLayout.VERTICAL);

        TextView title = new TextView(this);
        title.setText(titleText);
        title.setTextSize(15);
        title.setTextColor(COLOR_INK);
        textCol.addView(title);

        TextView summary = new TextView(this);
        summary.setText(summaryText);
        summary.setTextSize(12);
        summary.setTextColor(COLOR_MUTED);
        summary.setPadding(0, dp(2), 0, 0);
        textCol.addView(summary);

        card.addView(textCol, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f));

        Switch toggle = new Switch(this);
        toggle.setChecked(prefs.getBoolean(prefKey, defaultValue));
        toggle.setOnCheckedChangeListener((btn, isChecked) -> {
            prefs.edit().putBoolean(prefKey, isChecked).apply();
        });
        card.addView(toggle);

        parent.addView(card);

        // Разделитель между карточками
        View spacer = new View(this);
        parent.addView(spacer, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(8)));
    }

    private void buildInfoCard(LinearLayout parent, String titleText, String valueText) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(16), dp(12), dp(16), dp(12));
        card.setBackground(createCardBg());

        TextView title = new TextView(this);
        title.setText(titleText);
        title.setTextSize(14);
        title.setTextColor(COLOR_MUTED);
        card.addView(title, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f));

        TextView value = new TextView(this);
        value.setText(valueText);
        value.setTextSize(13);
        value.setTextColor(COLOR_LAVENDER);
        card.addView(value);

        parent.addView(card);

        View spacer = new View(this);
        parent.addView(spacer, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(8)));
    }

    private GradientDrawable createCardBg() {
        GradientDrawable gd = new GradientDrawable();
        gd.setColor(COLOR_PANEL);
        gd.setCornerRadius(dp(20));
        gd.setStroke(dp(1), COLOR_BORDER);
        return gd;
    }

    private int dp(float val) {
        return (int) Math.ceil(getResources().getDisplayMetrics().density * val);
    }
}
