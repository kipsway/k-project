package com.kipsway.ktube.ui.player;

import android.animation.ArgbEvaluator;
import android.animation.ValueAnimator;
import android.content.Context;
import android.util.AttributeSet;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.kipsway.ktube.patches.R;
import com.kipsway.ktube.tunnel.core.KTunnelState;
import com.kipsway.ktube.ui.settings.NodeSelectionBottomSheet;

/**
 * Capsule button in the YouTube video player overlay.
 * Shows status LED, ping, and provides instant toggle & node switcher.
 */
public class KTunnelCapsuleButton extends LinearLayout implements KTunnelState.StateListener {

    private ImageView statusLed;
    private TextView capsuleText;
    private LinearLayout capsuleContainer;

    public KTunnelCapsuleButton(Context context) {
        super(context);
        init(context);
    }

    public KTunnelCapsuleButton(Context context, AttributeSet attrs) {
        super(context, attrs);
        init(context);
    }

    private void init(Context context) {
        LayoutInflater.from(context).inflate(
            context.getResources().getIdentifier("ktube_player_capsule", "layout", context.getPackageName()),
            this,
            true
        );

        capsuleContainer = findViewById(context.getResources().getIdentifier("ktube_capsule_container", "id", context.getPackageName()));
        statusLed = findViewById(context.getResources().getIdentifier("ktube_status_led", "id", context.getPackageName()));
        capsuleText = findViewById(context.getResources().getIdentifier("ktube_capsule_text", "id", context.getPackageName()));

        // Tap: Toggle acceleration ON / OFF
        setOnClickListener(v -> {
            boolean current = KTunnelState.getInstance().isEnabled();
            boolean next = !current;
            KTunnelState.getInstance().setEnabled(next);

            String message = next
                ? "Ускорение k-Tunnel включено"
                : "Ускорение k-Tunnel отключено";
            Toast.makeText(getContext(), message, Toast.LENGTH_SHORT).show();
        });

        // Long press: Open node switch bottom sheet
        setOnLongClickListener(v -> {
            NodeSelectionBottomSheet.show(getContext());
            return true;
        });
    }

    @Override
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        KTunnelState.getInstance().registerListener(this);
    }

    @Override
    protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        KTunnelState.getInstance().unregisterListener(this);
    }

    @Override
    public void onTunnelStateChanged(KTunnelState.Status status, int pingMs, String activeNode) {
        post(() -> {
            if (statusLed == null || capsuleText == null || capsuleContainer == null) {
                return;
            }

            Context ctx = getContext();
            if (status == KTunnelState.Status.CONNECTED) {
                capsuleContainer.setBackgroundResource(ctx.getResources().getIdentifier("ktube_capsule_active", "drawable", ctx.getPackageName()));
                statusLed.setImageResource(ctx.getResources().getIdentifier("ktube_led_green", "drawable", ctx.getPackageName()));
                capsuleText.setText("Ускорение k-Tunnel • " + pingMs + " мс");
                capsuleText.setTextColor(0xFFD9CFFD); // Lavender ink
            } else if (status == KTunnelState.Status.CONNECTING) {
                capsuleContainer.setBackgroundResource(ctx.getResources().getIdentifier("ktube_capsule_bg", "drawable", ctx.getPackageName()));
                statusLed.setImageResource(ctx.getResources().getIdentifier("ktube_led_green", "drawable", ctx.getPackageName()));
                capsuleText.setText("Подключение k-Tunnel…");
                capsuleText.setTextColor(0xFFECEBF1);
            } else {
                capsuleContainer.setBackgroundResource(ctx.getResources().getIdentifier("ktube_capsule_bg", "drawable", ctx.getPackageName()));
                statusLed.setImageResource(ctx.getResources().getIdentifier("ktube_led_gray", "drawable", ctx.getPackageName()));
                capsuleText.setText("Ускорение k-Tunnel: Выкл");
                capsuleText.setTextColor(0xFF8D8A99); // Muted
            }
        });
    }
}
