package com.kipsway.ktube.tunnel.hooks;

import android.util.Log;
import com.kipsway.ktube.tunnel.core.KTunnelEngine;
import com.kipsway.ktube.tunnel.core.KTunnelState;
import org.json.JSONObject;

/**
 * Bytecode hook target for CronetEngine / CronetEngine.Builder in YouTube.
 * Cronet handles high-throughput video chunks (ExoPlayer).
 * Configures the Cronet proxy rules or PAC/SOCKS5 fallback.
 */
public final class CronetProxyHook {

    private static final String TAG = "kTube-CronetHook";

    /**
     * Injected into CronetEngine.Builder or ExperimentalCronetEngine.Builder
     * when setting experimental options or proxy configurations.
     */
    public static String getExperimentalOptionsJson(String originalOptions) {
        try {
            JSONObject options = (originalOptions != null && !originalOptions.isEmpty())
                    ? new JSONObject(originalOptions)
                    : new JSONObject();

            if (KTunnelState.getInstance().isEnabled()) {
                // Configure Cronet to route googlevideo traffic through local socks
                JSONObject proxyConfig = new JSONObject();
                proxyConfig.put("proxy_rules", "socks5://" + KTunnelEngine.LOCAL_HOST + ":" + KTunnelEngine.SOCKS_PORT);
                proxyConfig.put("proxy_bypass_list", "<local>,accounts.google.com");
                
                // Merge into options
                options.put("proxy", proxyConfig);
                Log.d(TAG, "Injected k-Tunnel proxy into Cronet experimental options.");
            }

            return options.toString();
        } catch (Throwable t) {
            Log.e(TAG, "Failed to patch Cronet options, falling back to original", t);
            return originalOptions;
        }
    }

    /**
     * Direct string proxy configuration for Cronet UrlRequestContext.
     */
    public static String getProxyConfigString() {
        if (!KTunnelState.getInstance().isEnabled()) {
            return "direct://";
        }
        return "socks5://" + KTunnelEngine.LOCAL_HOST + ":" + KTunnelEngine.SOCKS_PORT + "; direct://";
    }
}
