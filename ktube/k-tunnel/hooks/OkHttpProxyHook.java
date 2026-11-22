package com.kipsway.ktube.tunnel.hooks;

import com.kipsway.ktube.tunnel.core.KTunnelEngine;
import com.kipsway.ktube.tunnel.core.KTunnelState;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.SocketAddress;
import java.net.URI;
import java.util.Collections;
import java.util.List;

/**
 * Bytecode hook target for YouTube OkHttpClient instances.
 * Injected into OkHttpClient.Builder to set a dynamic ProxySelector.
 */
public final class OkHttpProxyHook {

    private static final Proxy SOCKS_PROXY = new Proxy(
        Proxy.Type.SOCKS,
        new InetSocketAddress(KTunnelEngine.LOCAL_HOST, KTunnelEngine.SOCKS_PORT)
    );

    private static final Proxy HTTP_PROXY = new Proxy(
        Proxy.Type.HTTP,
        new InetSocketAddress(KTunnelEngine.LOCAL_HOST, KTunnelEngine.HTTP_PORT)
    );

    private static final List<Proxy> PROXY_LIST = Collections.singletonList(SOCKS_PROXY);
    private static final List<Proxy> DIRECT_LIST = Collections.singletonList(Proxy.NO_PROXY);

    public static ProxySelector createSelectiveProxySelector(final ProxySelector defaultSelector) {
        return new ProxySelector() {
            @Override
            public List<Proxy> select(URI uri) {
                if (uri == null) {
                    return DIRECT_LIST;
                }

                String host = uri.getHost();
                if (NetworkTrafficRouter.shouldAccelerateHost(host)) {
                    return PROXY_LIST;
                }

                if (defaultSelector != null) {
                    return defaultSelector.select(uri);
                }
                return DIRECT_LIST;
            }

            @Override
            public void connectFailed(URI uri, SocketAddress sa, IOException ioe) {
                if (defaultSelector != null) {
                    defaultSelector.connectFailed(uri, sa, ioe);
                }
            }
        };
    }
}
