package com.kipsway.ktok;

import android.app.Dialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Диалог быстрого переключения страны ленты kTok («Сменить регион»).
 * Оформление: палитра «Мозаика» (#0A0A0C, лаванда #B8A7F0, рамка #7E6FC4).
 */
public class KTokRegionDialog extends Dialog {

    private static final String PREF_NAME = "ktok_preferences";
    private static final String KEY_REGION = "ktok_selected_region";

    // Цветовая палитра «Мозаика»
    private static final int COLOR_BG = 0xFF0A0A0C;
    private static final int COLOR_PANEL = 0xFF0F0F12;
    private static final int COLOR_BORDER = 0xFF2C2B32;
    private static final int COLOR_INK = 0xFFECEBF1;
    private static final int COLOR_MUTED = 0xFF8D8A99;
    private static final int COLOR_LAVENDER = 0xFFB8A7F0;
    private static final int COLOR_ACC_BG = 0xFF2A2442;
    private static final int COLOR_ACC_BORDER = 0xFF7E6FC4;

    // Список доступных регионов с человеческими названиями
    private static final RegionItem[] REGIONS = new RegionItem[]{
        new RegionItem("US", "🇺🇸 США", "Максимальное разнообразие трендов"),
        new RegionItem("DE", "🇩🇪 Германия", "Европейские рекомендации"),
        new RegionItem("NL", "🇳🇱 Нидерланды", "Стабильный европейский регион"),
        new RegionItem("FI", "🇫🇮 Финляндия", "Скандинавский регион"),
        new RegionItem("JP", "🇯🇵 Япония", "Азиатские тренды и анимация"),
        new RegionItem("KZ", "🇰🇿 Казахстан", "СНГ-контент без ограничений"),
        new RegionItem("GB", "🇬🇧 Великобритания", "Англоязычная лента"),
        new RegionItem("FR", "🇫🇷 Франция", "Европейский сегмент")
    };

    public interface OnRegionSelectedListener {
        void onRegionChanged(String code, String name);
    }

    private final OnRegionSelectedListener listener;

    public KTokRegionDialog(Context context, OnRegionSelectedListener listener) {
        super(context);
        this.listener = listener;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        final Context context = getContext();
        final SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        final String currentCode = prefs.getString(KEY_REGION, "US");

        // Фоновый сквиркл диалога
        GradientDrawable dialogBg = new GradientDrawable();
        dialogBg.setColor(COLOR_BG);
        dialogBg.setCornerRadius(dp(28));
        dialogBg.setStroke(dp(1), COLOR_BORDER);

        if (getWindow() != null) {
            getWindow().setBackgroundDrawable(dialogBg);
            getWindow().setLayout((int) (context.getResources().getDisplayMetrics().widthPixels * 0.90),
                    ViewGroup.LayoutParams.WRAP_CONTENT);
        }

        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(24), dp(20), dp(24));

        // Заголовок
        TextView title = new TextView(context);
        title.setText("Сменить регион");
        title.setTextSize(20);
        title.setTextColor(COLOR_INK);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        root.addView(title);

        TextView subtitle = new TextView(context);
        subtitle.setText("Выберите страну для ленты рекомендаций");
        subtitle.setTextSize(13);
        subtitle.setTextColor(COLOR_MUTED);
        subtitle.setPadding(0, dp(4), 0, dp(16));
        root.addView(subtitle);

        // Список стран в скролле
        ScrollView scrollView = new ScrollView(context);
        scrollView.setVerticalScrollBarEnabled(false);

        LinearLayout listLayout = new LinearLayout(context);
        listLayout.setOrientation(LinearLayout.VERTICAL);

        for (final RegionItem region : REGIONS) {
            final boolean isSelected = region.code.equalsIgnoreCase(currentCode);
            final View row = createRegionRow(context, region, isSelected, () -> {
                // Сохранение нового региона
                prefs.edit().putString(KEY_REGION, region.code).apply();
                Toast.makeText(context, "Регион изменен на: " + region.name + ". Лента обновляется…", Toast.LENGTH_SHORT).show();
                if (listener != null) {
                    listener.onRegionChanged(region.code, region.name);
                }
                dismiss();
            });
            listLayout.addView(row);

            // Отступ между карточками
            View spacer = new View(context);
            listLayout.addView(spacer, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, dp(8)));
        }

        scrollView.addView(listLayout);
        root.addView(scrollView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(320)));

        setContentView(root);
    }

    private View createRegionRow(Context context, RegionItem region, boolean isSelected, Runnable onClick) {
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(16), dp(12), dp(16), dp(12));

        GradientDrawable rowBg = new GradientDrawable();
        rowBg.setCornerRadius(dp(16));
        if (isSelected) {
            rowBg.setColor(COLOR_ACC_BG);
            rowBg.setStroke(dp(1.5f), COLOR_ACC_BORDER);
        } else {
            rowBg.setColor(COLOR_PANEL);
            rowBg.setStroke(dp(1), COLOR_BORDER);
        }
        row.setBackground(rowBg);

        LinearLayout textCol = new LinearLayout(context);
        textCol.setOrientation(LinearLayout.VERTICAL);

        TextView name = new TextView(context);
        name.setText(region.name);
        name.setTextSize(15);
        name.setTextColor(isSelected ? COLOR_LAVENDER : COLOR_INK);
        name.setTypeface(null, isSelected ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
        textCol.addView(name);

        TextView desc = new TextView(context);
        desc.setText(region.description);
        desc.setTextSize(11);
        desc.setTextColor(COLOR_MUTED);
        textCol.addView(desc);

        row.addView(textCol, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f));

        if (isSelected) {
            TextView badge = new TextView(context);
            badge.setText("АКТИВЕН");
            badge.setTextSize(10);
            badge.setTextColor(COLOR_LAVENDER);
            badge.setTypeface(null, android.graphics.Typeface.BOLD);
            row.addView(badge);
        }

        row.setOnClickListener(v -> onClick.run());
        return row;
    }

    private int dp(float val) {
        return (int) Math.ceil(getContext().getResources().getDisplayMetrics().density * val);
    }

    private static class RegionItem {
        final String code;
        final String name;
        final String description;

        RegionItem(String code, String name, String description) {
            this.code = code;
            this.name = name;
            this.description = description;
        }
    }
}
