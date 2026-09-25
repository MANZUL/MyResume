import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Button, Card, colors, Muted } from '../components/ui';
import { usePurchases } from '../lib/purchases';

const FEATURES = [
  'Export selectable-text PDFs',
  'Export editable Word (.docx) files',
  'All 12 templates, unlimited resumes',
  'No watermark, no subscription',
];

export default function UnlockScreen() {
  const { access, loading, exportPackage, purchase, restore } = usePurchases();
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);

  if (access.unlocked) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' }}>Exports unlocked</Text>
        <Button title="Done" onPress={() => router.back()} />
      </View>
    );
  }

  const buy = async () => {
    setBusy('buy');
    try {
      const result = await purchase();
      if (result === 'purchased') router.back();
    } catch (error) {
      Alert.alert('Purchase not completed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const doRestore = async () => {
    setBusy('restore');
    try {
      const restored = await restore();
      if (restored) router.back();
      else Alert.alert('Nothing to restore', 'No previous export purchase was found for this store account.');
    } catch (error) {
      Alert.alert('Restore failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const unavailable = access.reason === 'not-configured';
  const price = exportPackage?.product.priceString;

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>Unlock exports</Text>
      <Muted>One purchase. Your resume stays yours — edit and preview are always free.</Muted>
      <Card style={{ gap: 10 }}>
        {FEATURES.map((feature) => (
          <Text key={feature} style={{ fontSize: 16, color: colors.text }}>✓ {feature}</Text>
        ))}
      </Card>
      {access.reason === 'verification-failed' ? (
        <Muted>We could not verify your purchase with the store. Check your connection and tap Restore.</Muted>
      ) : null}
      {unavailable ? (
        <Muted>Purchases are not available in this build.</Muted>
      ) : (
        <>
          <Button
            title={price ? `Unlock for ${price}` : 'Unlock'}
            onPress={buy}
            loading={busy === 'buy' || loading}
            disabled={busy !== null || !exportPackage}
          />
          {!loading && !exportPackage ? <Muted>The store is unavailable right now. Please try again shortly.</Muted> : null}
          <Button title="Restore purchases" variant="ghost" onPress={doRestore} loading={busy === 'restore'} disabled={busy !== null} />
        </>
      )}
      <Button title="Not now" variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}
