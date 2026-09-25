import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { getRasterizerBridge, type RasterizerBridge } from './rasterizer-bridge';
import { loadRasterizerHtml } from './rasterizer-page';

/**
 * Hidden, offline WebView that rasterizes export PDFs for image export. Mounted
 * once in the root layout; it renders nothing until an image export runs, and
 * unmounts again when the job ends. It is not a screen: it has no input, and
 * only the export platform can give it work (through the bridge).
 */
export function RasterizerHost({ bridge = getRasterizerBridge() }: { bridge?: RasterizerBridge }) {
  const active = useSyncExternalStore(bridge.subscribe, () => bridge.active);
  const ref = useRef<WebView>(null);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    let mounted = true;
    loadRasterizerHtml().then(
      (page) => {
        if (mounted) setHtml(page);
      },
      () => bridge.fail('page_unavailable'),
    );
    bridge.attach({ run: (script) => ref.current?.injectJavaScript(script) });
    return () => {
      mounted = false;
      bridge.detach();
    };
  }, [active, bridge]);

  if (!active || html === null) return null;
  return (
    <View pointerEvents="none" style={styles.hidden} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <WebView
        ref={ref}
        source={{ html }}
        originWhitelist={['about:blank']}
        javaScriptEnabled
        // Offline only: no navigation, no file access, no remote loads (the page's CSP also blocks them).
        onShouldStartLoadWithRequest={(request) => request.url === 'about:blank'}
        allowFileAccess={false}
        setSupportMultipleWindows={false}
        cacheEnabled={false}
        incognito
        onMessage={(event) => bridge.handleMessage(event.nativeEvent.data)}
        onError={() => bridge.fail('webview_error')}
        onContentProcessDidTerminate={() => bridge.fail('webview_terminated')}
        onRenderProcessGone={() => bridge.fail('webview_terminated')}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', left: 0, top: 0, width: 2, height: 2, opacity: 0, overflow: 'hidden' },
  webview: { width: 2, height: 2 },
});
