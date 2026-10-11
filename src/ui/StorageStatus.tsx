import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../services/i18n/localization';
import { useResumeStore } from '../services/storage/resume-store';
import { Button, Card, colors } from './components';

// Storage problems are never hidden. A failed save keeps the edit on screen and in memory,
// and this banner (mounted once, above every screen) stays until a write is confirmed; Retry
// runs the real pending writes. A failed list load has its own card instead of the empty state.

/** One row: the message, then Retry (and Dismiss where the failure leaves nothing to retry). */
function Row({ message, onRetry, onDismiss }: { message: string; onRetry: () => Promise<unknown>; onDismiss?: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    if (busy) return; // one attempt at a time: no duplicate writes
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>{message}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title={t('storage.retry')} variant="secondary" fit loading={busy} onPress={retry} style={{ flex: 1, minHeight: 40 }} />
        {onDismiss ? <Button title={t('storage.dismiss')} variant="ghost" fit onPress={onDismiss} style={{ flex: 1, minHeight: 40 }} /> : null}
      </View>
    </View>
  );
}

/** Failed saves and deletes, above every screen. Renders nothing while storage is healthy. */
export function StorageBanner() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { status, retrySave, retryDelete, dismissDeleteError } = useResumeStore();
  if (!status.saveFailed && !status.deleteFailed) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopColor: colors.danger,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: Math.max(insets.bottom, 12),
        gap: 12,
      }}
    >
      {status.saveFailed ? <Row message={t('storage.saveFailed')} onRetry={retrySave} /> : null}
      {status.deleteFailed ? (
        <Row message={t('storage.deleteFailed', { title: status.deleteFailed.title })} onRetry={retryDelete} onDismiss={dismissDeleteError} />
      ) : null}
    </View>
  );
}

/**
 * Covers the app while a backup or restore runs: touches are caught here, so nothing can be edited
 * underneath it (the library refuses changes as well).
 */
export function BusyOverlay() {
  const { status } = useResumeStore();
  if (!status.busy) return null;
  return (
    <View
      accessibilityViewIsModal
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, opacity: 0.85 }}
    >
      <ActivityIndicator size="large" color={colors.text} />
    </View>
  );
}

/** Shown instead of the empty-library state when the saved resumes could not be read. */
export function LoadFailedCard() {
  const t = useT();
  const { retryLoad } = useResumeStore();
  const [busy, setBusy] = useState(false);
  return (
    <View accessibilityRole="alert">
    <Card style={{ gap: 8, borderWidth: 1, borderColor: colors.danger }}>
      <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{t('storage.loadFailedTitle')}</Text>
      <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>{t('database.unchanged')}</Text>
      <Button
        title={t('storage.retry')}
        loading={busy}
        onPress={async () => {
          if (busy) return;
          setBusy(true);
          try {
            await retryLoad();
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
    </View>
  );
}
