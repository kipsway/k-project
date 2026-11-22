package com.kipsway.ktube.ui.settings;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.widget.SwitchCompat;
import androidx.fragment.app.Fragment;

import com.kipsway.ktube.tunnel.core.KTunnelEngine;
import com.kipsway.ktube.tunnel.core.KTunnelState;

/**
 * Settings Fragment for k-Tunnel integrated in YouTube's Settings screen.
 */
public class KTunnelSettingsFragment extends Fragment implements KTunnelState.StateListener {

    private SwitchCompat masterSwitch;
    private TextView statusSummary;
    private TextView activeNodeTitle;
    private View nodePickerCard;
    private View btnSyncSubscription;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        int layoutId = getResources().getIdentifier("ktube_settings_fragment", "layout", requireContext().getPackageName());
        View root = inflater.inflate(layoutId, container, false);

        int switchId = getResources().getIdentifier("ktube_tunnel_master_switch", "id", requireContext().getPackageName());
        int summaryId = getResources().getIdentifier("ktube_settings_status_summary", "id", requireContext().getPackageName());
        int nodeTitleId = getResources().getIdentifier("ktube_active_node_title", "id", requireContext().getPackageName());
        int pickerCardId = getResources().getIdentifier("ktube_node_picker_card", "id", requireContext().getPackageName());
        int syncBtnId = getResources().getIdentifier("ktube_btn_sync_subscription", "id", requireContext().getPackageName());

        masterSwitch = root.findViewById(switchId);
        statusSummary = root.findViewById(summaryId);
        activeNodeTitle = root.findViewById(nodeTitleId);
        nodePickerCard = root.findViewById(pickerCardId);
        btnSyncSubscription = root.findViewById(syncBtnId);

        masterSwitch.setChecked(KTunnelState.getInstance().isEnabled());
        masterSwitch.setOnCheckedChangeListener((buttonView, isChecked) -> {
            KTunnelState.getInstance().setEnabled(isChecked);
        });

        nodePickerCard.setOnClickListener(v -> {
            NodeSelectionBottomSheet.show(requireContext());
        });

        btnSyncSubscription.setOnClickListener(v -> {
            Toast.makeText(requireContext(), "Синхронизация узлов подписки…", Toast.LENGTH_SHORT).show();
            KTunnelEngine.getInstance().syncSubscriptionNodes();
        });

        return root;
    }

    @Override
    public void onResume() {
        super.onResume();
        KTunnelState.getInstance().registerListener(this);
    }

    @Override
    public void onPause() {
        super.onPause();
        KTunnelState.getInstance().unregisterListener(this);
    }

    @Override
    public void onTunnelStateChanged(KTunnelState.Status status, int pingMs, String activeNode) {
        if (getActivity() == null) return;
        getActivity().runOnUiThread(() -> {
            if (masterSwitch != null) {
                masterSwitch.setChecked(status == KTunnelState.Status.CONNECTED);
            }
            if (statusSummary != null) {
                if (status == KTunnelState.Status.CONNECTED) {
                    statusSummary.setText("Активно • Задержка " + pingMs + " мс");
                } else if (status == KTunnelState.Status.CONNECTING) {
                    statusSummary.setText("Подключение к узлу…");
                } else {
                    statusSummary.setText("Ускорение отключено");
                }
            }
            if (activeNodeTitle != null) {
                activeNodeTitle.setText(activeNode);
            }
        });
    }
}
