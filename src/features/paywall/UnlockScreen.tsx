import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { PREMIUM_PRICE } from '../../domain/entitlement/subscription';
import { useEntitlement } from '../../services/entitlement/entitlement';
import { Button, Card, colors, Muted } from '../../ui/components';

const FEATURES = [
  'Export PDF and Word (.docx) files',
  'Image export and sharing',
  'Clean output with no watermark',
  'Writing Coach, Job Match and Tailoring',
  'Custom accent colors',
];

export default function UnlockScreen() {
  const { decision, offer, entitlements, paywall } = useEntitlement();
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);

  const close = () => {
    paywall.dismiss();
    router.back();
  };

  if (decision.premium) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' }}>You have Premium</Text>
        <Button title="Done" onPress={close} />
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
      else if (outcome === 'pending') Alert.alert('Purchase pending', 'Premium unlocks as soon as the purchase is approved.');
      else if (outcome !== 'cancelled') Alert.alert('Purchase not completed', 'The purchase could not be verified. Please try again.');
    } catch (error) {
      Alert.alert('Purchase not completed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const doRestore = async () => {
    setBusy('restore');
    try {
      const { premium, resume } = await paywall.restore();
      if (premium) await finish(resume);
      else Alert.alert('Nothing to restore', 'No active Premium subscription was found for this store account.');
    } catch (error) {
      Alert.alert('Restore failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const unavailable = entitlements.providerId === 'unavailable';
  const price = offer?.priceString ?? PREMIUM_PRICE.amount;

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>{PREMIUM_PRICE.label}</Text>
      <Muted>Building and editing stay free. Premium lets you take your resume out of the app.</Muted>
      <Card style={{ gap: 10 }}>
        {FEATURES.map((feature) => (
          <Text key={feature} style={{ fontSize: 16, color: colors.text }}>✓ {feature}</Text>
        ))}
      </Card>
      <Muted>{`${price} per month. Renews automatically until cancelled; cancel anytime in your store account settings.`}</Muted>
      {decision.reason === 'cache_stale' || decision.reason === 'clock_rollback' ? (
        <Muted>Connect to the internet so your subscription can be verified, or tap Restore.</Muted>
      ) : null}
      {unavailable ? (
        <Muted>Purchases are not available in this build.</Muted>
      ) : (
        <>
          <Button
            title={`Subscribe — ${price}/month`}
            onPress={buy}
            loading={busy === 'buy'}
            disabled={busy !== null || !offer}
          />
          {!offer ? <Muted>The store is unavailable right now. Please try again shortly.</Muted> : null}
          <Button title="Restore purchases" variant="ghost" onPress={doRestore} loading={busy === 'restore'} disabled={busy !== null} />
        </>
      )}
      <Button title="Not now" variant="secondary" onPress={close} />
    </ScrollView>
  );
}
