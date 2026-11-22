package com.kipsway.ktube.branding;

import android.app.Dialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * "About kTube" dialog rendered in Liquid Glass + Onyx + Lavender style.
 */
public final class AboutDialog {

    public static void show(Context context) {
        Dialog dialog = new Dialog(context);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout root = new LinearLayout(context);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF0F0F12); // #0F0F12
        root.setPadding(48, 48, 48, 48);

        TextView title = new TextView(context);
        title.setText("kTube by kipsway");
        title.setTextColor(0xFFECEBF1);
        title.setTextSize(20);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        root.addView(title);

        TextView version = new TextView(context);
        version.setText("Версия 1.0.0 • Сборка Релиз");
        version.setTextColor(0xFFB8A7F0); // Lavender
        version.setTextSize(13);
        version.setPadding(0, 4, 0, 24);
        root.addView(version);

        TextView desc = new TextView(context);
        desc.setText("Кастомный клиент YouTube без рекламы, со встроенным SponsorBlock и сетевым ядром k-Tunnel для обхода замедления (DPI) в 4K.\n\nДизайн: «Мозаика» (Chatterino+ by Rish) + Material You 3.");
        desc.setTextColor(0xFF8D8A99);
        desc.setTextSize(14);
        desc.setLineSpacing(0, 1.25f);
        desc.setPadding(0, 0, 0, 32);
        root.addView(desc);

        Button closeBtn = new Button(context);
        closeBtn.setText("Закрыть");
        closeBtn.setTextColor(0xFF0A0A0C);
        closeBtn.setBackgroundColor(0xFFB8A7F0); // Lavender capsule
        closeBtn.setOnClickListener(v -> dialog.dismiss());
        root.addView(closeBtn);

        dialog.setContentView(root);
        Window window = dialog.getWindow();
        if (window != null) {
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            window.setGravity(Gravity.CENTER);
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        }
        dialog.show();
    }
}
