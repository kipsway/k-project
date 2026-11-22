package com.kipsway.ktok;

import android.app.Dialog;
import android.content.Context;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Быстрое меню действий kTok по долгому тапу на видео или через кнопку "Поделиться".
 * Оформление: палитра «Мозаика» (#0A0A0C, лаванда #B8A7F0).
 */
public class KTokActionDialog extends Dialog {

    private static final int COLOR_BG = 0xFF0A0A0C;
    private static final int COLOR_PANEL = 0xFF0F0F12;
    private static final int COLOR_BORDER = 0xFF2C2B32;
    private static final int COLOR_INK = 0xFFECEBF1;
    private static final int COLOR_MUTED = 0xFF8D8A99;
    private static final int COLOR_LAVENDER = 0xFFB8A7F0;
    private static final int COLOR_ACC_BG = 0xFF2A2442;
    private static final int COLOR_ACC_BORDER = 0xFF7E6FC4;

    private final String videoUrl;
    private final String audioUrl;
    private final String videoId;
    private final String trackTitle;

    public KTokActionDialog(Context context, String videoUrl, String audioUrl, String videoId, String trackTitle) {
        super(context);
        this.videoUrl = videoUrl;
        this.audioUrl = audioUrl;
        this.videoId = videoId;
        this.trackTitle = trackTitle;
    }

    public static void showMenu(Context context, String videoUrl, String audioUrl, String videoId, String trackTitle) {
        if (context == null) return;
        new KTokActionDialog(context, videoUrl, audioUrl, videoId, trackTitle).show();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        final Context context = getContext();

        // Скругленный фон снизу (Bottom Sheet стиль)
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(COLOR_BG);
        bg.setCornerRadii(new float[]{dp(28), dp(28), dp(28), dp(28), 0, 0, 0, 0});
        bg.setStroke(dp(1), COLOR_BORDER);

        if (getWindow() != null) {
            getWindow().setBackgroundDrawable(bg);
            getWindow().setGravity(Gravity.BOTTOM);
            getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        }

        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(16), dp(20), dp(32));

        // Полоска-граббер
        View grabber = new View(context);
        GradientDrawable grabberBg = new GradientDrawable();
        grabberBg.setColor(COLOR_BORDER);
        grabberBg.setCornerRadius(dp(2));
        grabber.setBackground(grabberBg);
        LinearLayout.LayoutParams grabberLp = new LinearLayout.LayoutParams(dp(36), dp(4));
        grabberLp.gravity = Gravity.CENTER_HORIZONTAL;
        grabberLp.bottomMargin = dp(20);
        root.addView(grabber, grabberLp);

        // Заголовок меню
        TextView title = new TextView(context);
        title.setText("Меню kTok");
        title.setTextSize(18);
        title.setTextColor(COLOR_INK);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        title.setPadding(dp(4), 0, dp(4), dp(16));
        root.addView(title);

        // 1. Действие: Скачать без знака
        root.addView(createActionButton(
            context,
            "⬇",
            "Скачать без знака",
            "Сохранить видео в галерею в максимальном качестве",
            () -> {
                KTokDownloader.downloadCleanVideo(context, videoUrl, videoId);
                dismiss();
            }
        ));

        root.addView(createSpacer(dp(8)));

        // 2. Действие: Скачать аудио
        root.addView(createActionButton(
            context,
            "🎵",
            "Скачать аудио",
            "Экспорт трека в Music/kTok (.mp3)",
            () -> {
                KTokDownloader.downloadAudio(context, audioUrl, trackTitle);
                dismiss();
            }
        ));

        root.addView(createSpacer(dp(8)));

        // 3. Действие: Сменить регион
        root.addView(createActionButton(
            context,
            "🌍",
            "Сменить регион",
            "Выбрать другую страну для рекомендаций ленты",
            () -> {
                dismiss();
                KTokHook.showRegionDialog(context);
            }
        ));

        root.addView(createSpacer(dp(8)));

        // 4. Действие: Настройки kTok
        root.addView(createActionButton(
            context,
            "⚙",
            "Настройки kTok",
            "Все параметры мода от kipsway",
            () -> {
                dismiss();
                KTokHook.openSettingsActivity(context);
            }
        ));

        setContentView(root);
    }

    private View createActionButton(Context context, String emoji, String titleText, String subtitleText, Runnable action) {
        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(16), dp(14), dp(16), dp(14));

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(COLOR_PANEL);
        bg.setCornerRadius(dp(16));
        bg.setStroke(dp(1), COLOR_BORDER);
        row.setBackground(bg);

        // Иконка
        TextView icon = new TextView(context);
        icon.setText(emoji);
        icon.setTextSize(20);
        icon.setPadding(0, 0, dp(14), 0);
        row.addView(icon);

        LinearLayout textCol = new LinearLayout(context);
        textCol.setOrientation(LinearLayout.VERTICAL);

        TextView title = new TextView(context);
        title.setText(titleText);
        title.setTextSize(15);
        title.setTextColor(COLOR_INK);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        textCol.addView(title);

        TextView sub = new TextView(context);
        sub.setText(subtitleText);
        sub.setTextSize(12);
        sub.setTextColor(COLOR_MUTED);
        sub.setPadding(0, dp(2), 0, 0);
        textCol.addView(sub);

        row.addView(textCol, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f));

        TextView arrow = new TextView(context);
        arrow.setText("›");
        arrow.setTextSize(20);
        arrow.setTextColor(COLOR_LAVENDER);
        row.addView(arrow);

        row.setOnClickListener(v -> action.run());
        return row;
    }

    private View createSpacer(int heightPx) {
        View v = new View(getContext());
        v.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, heightPx));
        return v;
    }

    private int dp(float val) {
        return (int) Math.ceil(getContext().getResources().getDisplayMetrics().density * val);
    }
}
