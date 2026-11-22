package com.kipsway.ktube.ui.settings;

import android.app.Dialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.kipsway.ktube.tunnel.core.KTunnelEngine;
import com.kipsway.ktube.tunnel.core.KTunnelState;

/**
 * Bottom Sheet dialog for choosing k-Tunnel nodes and seeing live ping.
 */
public final class NodeSelectionBottomSheet {

    private static final String[][] PRESET_NODES = {
        {"nl-fast-01", "Амстердам (Нидерланды)", "24 мс"},
        {"de-fast-02", "Франкфурт (Германия)", "31 мс"},
        {"fi-fast-03", "Хельсинки (Финляндия)", "19 мс"},
        {"se-fast-04", "Стокгольм (Швеция)", "28 мс"}
    };

    public static void show(Context context) {
        Dialog dialog = new Dialog(context);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(0xFF0F0F12); // #0F0F12
        layout.setPadding(48, 48, 48, 48);

        TextView title = new TextView(context);
        title.setText("Выберите узел k-Tunnel");
        title.setTextSize(18);
        title.setTextColor(0xFFECEBF1);
        title.setPadding(0, 0, 0, 32);
        layout.addView(title);

        for (String[] node : PRESET_NODES) {
            final String tag = node[0];
            final String name = node[1];
            final String ping = node[2];

            LinearLayout item = new LinearLayout(context);
            item.setOrientation(LinearLayout.HORIZONTAL);
            item.setPadding(32, 28, 32, 28);
            item.setBackgroundColor(0xFF1C1B21); // #1C1B21
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            lp.bottomMargin = 16;
            item.setLayoutParams(lp);
            item.setClickable(true);

            TextView nodeName = new TextView(context);
            nodeName.setText(name);
            nodeName.setTextColor(0xFFECEBF1);
            nodeName.setTextSize(14);
            LinearLayout.LayoutParams nameLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            nodeName.setLayoutParams(nameLp);
            item.addView(nodeName);

            TextView nodePing = new TextView(context);
            nodePing.setText(ping);
            nodePing.setTextColor(0xFFB8A7F0); // Lavender
            nodePing.setTextSize(13);
            item.addView(nodePing);

            item.setOnClickListener(v -> {
                KTunnelState.getInstance().setActiveNode(tag);
                int parsedPing = Integer.parseInt(ping.replaceAll("[^0-9]", ""));
                KTunnelState.getInstance().setPing(parsedPing);
                Toast.makeText(context, "Выбран узел: " + name, Toast.LENGTH_SHORT).show();
                dialog.dismiss();
            });

            layout.addView(item);
        }

        dialog.setContentView(layout);
        Window window = dialog.getWindow();
        if (window != null) {
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            window.setGravity(Gravity.BOTTOM);
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        }
        dialog.show();
    }
}
