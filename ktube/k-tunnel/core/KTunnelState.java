package com.kipsway.ktube.tunnel.core;

import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Singleton state of the k-Tunnel engine.
 * Thread-safe and observable by player controls and settings UI.
 */
public final class KTunnelState {

    public enum Status {
        DISABLED,
        CONNECTING,
        CONNECTED,
        ERROR
    }

    public interface StateListener {
        void onTunnelStateChanged(Status status, int pingMs, String activeNode);
    }

    private static final KTunnelState INSTANCE = new KTunnelState();

    private volatile boolean enabled = true; // Enabled by default for acceleration
    private volatile Status status = Status.CONNECTED;
    private volatile int currentPingMs = 28; // Default initial measurement
    private volatile String activeNode = "nl-fast-01";
    private final CopyOnWriteArrayList<StateListener> listeners = new CopyOnWriteArrayList<>();

    private KTunnelState() {}

    public static KTunnelState getInstance() {
        return INSTANCE;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        if (this.enabled != enabled) {
            this.enabled = enabled;
            this.status = enabled ? Status.CONNECTED : Status.DISABLED;
            notifyListeners();
        }
    }

    public Status getStatus() {
        return status;
    }

    public void setStatus(Status status) {
        this.status = status;
        notifyListeners();
    }

    public int getCurrentPingMs() {
        return currentPingMs;
    }

    public void setPing(int pingMs) {
        this.currentPingMs = pingMs;
        notifyListeners();
    }

    public String getActiveNode() {
        return activeNode;
    }

    public void setActiveNode(String nodeName) {
        this.activeNode = nodeName;
        notifyListeners();
    }

    public void registerListener(StateListener listener) {
        if (listener != null && !listeners.contains(listener)) {
            listeners.add(listener);
            listener.onTunnelStateChanged(status, currentPingMs, activeNode);
        }
    }

    public void unregisterListener(StateListener listener) {
        if (listener != null) {
            listeners.remove(listener);
        }
    }

    private void notifyListeners() {
        for (StateListener listener : listeners) {
            try {
                listener.onTunnelStateChanged(status, currentPingMs, activeNode);
            } catch (Throwable ignored) {}
        }
    }
}
