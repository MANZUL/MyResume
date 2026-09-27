import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { PREMIUM_PRICE } from '../../domain/entitlement/subscription';
import { useEntitlement } from '../../services/entitlement/entitlement';
import { Button, Card, colors, Muted } from '../../ui/components';
import { useT } from '../../services/i18n/localization';

const FEATURES = ['export', 'image', 'clean', 'tools', 'colors'] as const;

export default function UnlockScreen() {
  const { decision, offer, entitlements, paywall } = useEntitlement();
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const t = useT();

  const close = () => {
    paywall.dismiss();
    router.back();
  };

  if (decision.premium) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' }}>{t('paywall.havePremium')}</Text>
        <Button title={t('paywall.done')} onPress={close} />
      </View>
    );
  }

  // After a verified subscription the paywall closes and the original action runs
  // again through its own premium checks.
  const finish = async (resume: (() => Promise<void>) | null) => {
    router.back();
    if (resume) await resume();
  };

  const buy = async () => {
    setBusy('buy');
    try {
      const { outcome, resume } = await paywall.subscribe();
      if (outcome === 'subscribed') await finish(resume);
      else if (outcome === 'pending') Alert.alert(t('paywall.pendingTitle'), t('paywall.pendingBody'));
      else if (outcome !== 'cancelled') Alert.alert(t('paywall.notCompletedTitle'), t('paywall.notVerified'));
    } catch (error) {
      Alert.alert(t('paywall.notCompletedTitle'), error instanceof Error ? error.message : t('paywall.tryAgain'));
    } finally {
      setBusy(null);
    }
  };

  const doRestore = async () => {
    setBusy('restore');
    try {
      const { premium, resume } = await paywall.restore();
      if (premium) await finish(resume);
      else Alert.alert(t('paywall.nothingTitle'), t('paywall.nothingBody'));
    } catch (error) {
      Alert.alert(t('paywall.restoreFailed'), error instanceof Error ? error.message : t('paywall.tryAgain'));
    } finally {
      setBusy(null);
    }
  };

  const unavailable = entitlements.providerId === 'unavailable';
  const price = offer?.priceString ?? PREMIUM_PRICE.amount;

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>{t('paywall.heading', { price: PREMIUM_PRICE.amount })}</Text>
      <Muted>{t('paywall.intro')}</Muted>
      <Card style={{ gap: 10 }}>
        {FEATURES.map((feature) => (
          <Text key={feature} style={{ fontSize: 16, color: colors.text }}>✓ {t(`paywall.features.${feature}`)}</Text>
        ))}
      </Card>
      <Muted>{t('paywall.terms', { price })}</Muted>
      {decision.reason === 'cache_stale' || decision.reason === 'clock_rollback' ? (
        <Muted>{t('paywall.verify')}</Muted>
      ) : null}
      {unavailable ? (
        <Muted>{t('paywall.unavailable')}</Muted>
      ) : (
        <>
          <Button
            title={t('paywall.subscribe', { price })}
            onPress={buy}
            loading={busy === 'buy'}
            disabled={busy !== null || !offer}
          />
          {!offer ? <Muted>{t('paywall.storeUnavailable')}</Muted> : null}
          <Button title={t('paywall.restore')} variant="ghost" onPress={doRestore} loading={busy === 'restore'} disabled={busy !== null} />
        </>
      )}
      <Button title={t('paywall.notNow')} variant="secondary" onPress={close} />
    </ScrollView>
  );
}
