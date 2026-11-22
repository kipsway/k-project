package com.kipsway.ktube.tunnel.hooks;

import android.net.Uri;
import com.kipsway.ktube.tunnel.core.KTunnelState;

/**
 * Domain filter for selective video acceleration.
 * Decides whether an incoming HTTP/QUIC request should pass through
 * the local k-Tunnel SOCKS/HTTP loopback or proceed directly.
 */
public final class NetworkTrafficRouter {

    private static final String[] VIDEO_DOMAINS = {
        "googlevideo.com",
        "videoplayback",
        "ytimg.com",
        "youtubei.googleapis.com"
    };

    /**
     * Returns true if request URL should be accelerated via k-Tunnel.
     */
    public static boolean shouldAccelerate(String urlString) {
        if (!KTunnelState.getInstance().isEnabled()) {
            return false;
        }
        if (urlString == null || urlString.isEmpty()) {
            return false;
        }

        try {
            Uri uri = Uri.parse(urlString);
            String host = uri.getHost();
            if (host == null) {
                return false;
            }

            // Always accelerate video streaming chunks
            for (String domain : VIDEO_DOMAINS) {
                if (host.contains(domain)) {
                    return true;
                }
            }

            if (urlString.contains("/videoplayback")) {
                return true;
            }
        } catch (Throwable ignored) {}

        return false;
    }

    public static boolean shouldAccelerateHost(String host) {
        if (!KTunnelState.getInstance().isEnabled()) {
            return false;
        }
        if (host == null) return false;

        for (String domain : VIDEO_DOMAINS) {
            if (host.contains(domain)) {
                return true;
            }
        }
        return false;
    }
}
