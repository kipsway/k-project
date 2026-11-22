package org.kipsway.kgram.settings;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import org.kipsway.kgram.theme.MozaikThemeManager;
import org.telegram.messenger.AndroidUtilities;
import org.telegram.messenger.LocaleController;
import org.telegram.messenger.R;
import org.telegram.ui.ActionBar.ActionBar;
import org.telegram.ui.ActionBar.BaseFragment;
import org.telegram.ui.ActionBar.Theme;

/**
 * Экран «Настройки kGram» (by kipsway).
 * 
 * Правила дизайна («Сделано человеком», Anti-Bloat):
 * - Полная нативность Telegram/NimarkoGram
 * - Человеческий русский язык: «Цвета Мозаика», «Музыкальный плеер», «Призрачный режим», «Ускорение k-Tunnel»
 * - Никаких лишних плашек, рекламы или технических аббревиатур
 * - Фирменная подпись: by kipsway
 */
public class KGramSettingsFragment extends BaseFragment {

    private LinearLayout contentContainer;

    @Override
    public View createView(Context context) {
        // 1. Настройка Action Bar
        actionBar.setBackButtonImage(R.drawable.ic_ab_back);
        actionBar.setAllowOverlayTitle(true);
        actionBar.setTitle("Настройки kGram");
        actionBar.setSubtitle("by kipsway");
        actionBar.setActionBarMenuOnItemClick(new ActionBar.ActionBarMenuOnItemClick() {
            @Override
            public void onItemClick(int id) {
                if (id == -1) {
                    finishFragment();
                }
            }
        });

        // 2. Корневой ScrollView с ониксовым фоном
        ScrollView scrollView = new ScrollView(context);
        scrollView.setBackgroundColor(MozaikThemeManager.COLOR_BG_ONYX);
        scrollView.setVerticalScrollBarEnabled(false);

        contentContainer = new LinearLayout(context);
        contentContainer.setOrientation(LinearLayout.VERTICAL);
        contentContainer.setPadding(dp(16), dp(16), dp(16), dp(48));
        scrollView.addView(contentContainer);

        // 3. Брендированная карточка kGram
        addHeroBrandCard();

        // 4. Раздел: ОФОРМЛЕНИЕ
        addSectionHeader("ОФОРМЛЕНИЕ");
        addToggleCell(
            "Цвета Мозаика",
            "Глубокий оникс #0A0A0C и акцентная лаванда #B8A7F0 из Chatterino+",
            KGramConfig.isMozaikTheme(context),
            (btn, isChecked) -> {
                KGramConfig.setMozaikTheme(context, isChecked);
                MozaikThemeManager.setMozaikThemeEnabled(context, isChecked);
            }
        );

        // 5. Раздел: МУЗЫКА И МЕДИА
        addSectionHeader("МУЗЫКА И МЕДИА");
        addToggleCell(
            "Музыкальный плеер",
            "Полноэкранный плеер в стиле RX Playa: крупная обложка 28dp, виньетка и жесты свайпа",
            KGramConfig.isRxPlayaEnabled(context),
            (btn, isChecked) -> KGramConfig.setRxPlayaEnabled(context, isChecked)
        );
        addToggleCell(
            "HD-видеосообщения",
            "Запись видеокружочков через CameraX в повышенном битрейте без артефактов сжатия",
            KGramConfig.isHdVideoNotesEnabled(context),
            (btn, isChecked) -> KGramConfig.setHdVideoNotesEnabled(context, isChecked)
        );

        // 6. Раздел: СЕТЬ И СВЯЗЬ
        addSectionHeader("СЕТЬ И СВЯЗЬ");
        addToggleCell(
            "Ускорение k-Tunnel",
            "Статус: " + org.kipsway.kgram.network.KTunnelManager.getStatusDescription(context) + " • Без внешних VPN",
            KGramConfig.isKTunnelEnabled(context),
            (btn, isChecked) -> org.kipsway.kgram.network.KTunnelManager.setKTunnelEnabled(context, isChecked)
        );

        // 7. Раздел: ПРИВАТНОСТЬ
        addSectionHeader("ПРИВАТНОСТЬ (NIMARKOGRAM)");
        addToggleCell(
            "Призрачный режим",
            "Не отмечать входящие сообщения прочитанными при их открытии",
            KGramConfig.isGhostModeEnabled(context),
            (btn, isChecked) -> KGramConfig.setGhostModeEnabled(context, isChecked)
        );
        addToggleCell(
            "Скрыть статус набора текста",
            "Собеседники не видят индикатор «печатает...» в чатах",
            KGramConfig.isHideTypingEnabled(context),
            (btn, isChecked) -> KGramConfig.setHideTypingEnabled(context, isChecked)
        );
        addToggleCell(
            "Сохранять удаленные сообщения",
            "Отображать удаленные собеседником реплики со специальной деликатной меткой",
            KGramConfig.isKeepDeletedEnabled(context),
            (btn, isChecked) -> KGramConfig.setKeepDeletedEnabled(context, isChecked)
        );

        // 8. Футер авторства
        addFooterView();

        fragmentView = scrollView;
        return fragmentView;
    }

    private void addHeroBrandCard() {
        LinearLayout card = new LinearLayout(getParentActivity());
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(20), dp(20), dp(20), dp(20));

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(MozaikThemeManager.COLOR_PANEL);
        cardBg.setCornerRadius(dp(16));
        cardBg.setStroke(dp(1), MozaikThemeManager.COLOR_BORDER);
        card.setBackground(cardBg);

        TextView title = new TextView(getParentActivity());
        title.setText("kGram");
        title.setTextSize(22);
        title.setTextColor(MozaikThemeManager.COLOR_INK);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        card.addView(title);

        TextView subtitle = new TextView(getParentActivity());
        subtitle.setText("by kipsway • Версия 10.9.1 (на базе NimarkoGram)");
        subtitle.setTextSize(13);
        subtitle.setTextColor(MozaikThemeManager.COLOR_LAVENDER);
        subtitle.setPadding(0, dp(4), 0, dp(8));
        card.addView(subtitle);

        TextView desc = new TextView(getParentActivity());
        desc.setText("Форк Telegram с дизайн-системой «Мозаика», аудиоплеером RX Playa и сетевым ускорением k-Tunnel.");
        desc.setTextSize(12);
        desc.setTextColor(MozaikThemeManager.COLOR_MUTED);
        card.addView(desc);

        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cardLp.bottomMargin = dp(16);
        contentContainer.addView(card, cardLp);
    }

    private void addSectionHeader(String title) {
        TextView header = new TextView(getParentActivity());
        header.setText(title);
        header.setTextSize(12);
        header.setTextColor(MozaikThemeManager.COLOR_LAVENDER);
        header.setTypeface(null, android.graphics.Typeface.BOLD);
        header.setPadding(dp(8), dp(16), dp(8), dp(8));
        contentContainer.addView(header);
    }

    private void addToggleCell(String title, String summary, boolean initialValue,
                               android.widget.CompoundButton.OnCheckedChangeListener listener) {
        LinearLayout cell = new LinearLayout(getParentActivity());
        cell.setOrientation(LinearLayout.HORIZONTAL);
        cell.setGravity(Gravity.CENTER_VERTICAL);
        cell.setPadding(dp(16), dp(14), dp(16), dp(14));

        GradientDrawable cellBg = new GradientDrawable();
        cellBg.setColor(MozaikThemeManager.COLOR_PANEL);
        cellBg.setCornerRadius(dp(12));
        cellBg.setStroke(dp(1), MozaikThemeManager.COLOR_BORDER);
        cell.setBackground(cellBg);

        LinearLayout textCol = new LinearLayout(getParentActivity());
        textCol.setOrientation(LinearLayout.VERTICAL);

        TextView titleView = new TextView(getParentActivity());
        titleView.setText(title);
        titleView.setTextSize(16);
        titleView.setTextColor(MozaikThemeManager.COLOR_INK);
        titleView.setTypeface(null, android.graphics.Typeface.BOLD);
        textCol.addView(titleView);

        TextView summaryView = new TextView(getParentActivity());
        summaryView.setText(summary);
        summaryView.setTextSize(12);
        summaryView.setTextColor(MozaikThemeManager.COLOR_MUTED);
        summaryView.setPadding(0, dp(4), 0, 0);
        textCol.addView(summaryView);

        cell.addView(textCol, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.0f));

        Switch toggle = new Switch(getParentActivity());
        toggle.setChecked(initialValue);
        toggle.setOnCheckedChangeListener(listener);
        cell.addView(toggle);

        LinearLayout.LayoutParams cellLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cellLp.bottomMargin = dp(8);
        contentContainer.addView(cell, cellLp);
    }

    private void addFooterView() {
        TextView footer = new TextView(getParentActivity());
        footer.setText("kGram • by kipsway • Сделано человеком");
        footer.setTextSize(11);
        footer.setTextColor(MozaikThemeManager.COLOR_FAINT);
        footer.setGravity(Gravity.CENTER);
        footer.setPadding(0, dp(24), 0, dp(16));
        contentContainer.addView(footer);
    }

    private int dp(float val) {
        return AndroidUtilities.dp(val);
    }
}
