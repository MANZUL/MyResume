import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { Button, Card, colors, Muted } from '../../ui/components';
import { backupErrorText } from '../../i18n/backup';
import { useBackupService } from '../../services/backup/use-backup-service';
import { useLocalization } from '../../services/i18n/localization';
import { useResumeStore } from '../../services/storage/resume-store';

type Phase = 'idle' | 'exporting' | 'checking' | 'restoring';
type Message = { kind: 'error' | 'info'; text: string } | null;

/**
 * Backup and restore of all resumes. Export writes one JSON file and opens the system share sheet;
 * restore reads a file the user picks, checks all of it, asks for confirmation (with the number of
 * resumes on both sides), and only then replaces everything in one transaction. Nothing is uploaded.
 */
export default function BackupScreen() {
  const { t, appLanguage, setAppLanguage } = useLocalization();
  const { resumes } = useResumeStore();
  const backup = useBackupService();
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<Message>(null);
  const busy = phase !== 'idle';

  const exportBackup = async () => {
    setMessage(null);
    setPhase('exporting');
    try {
      const result = await backup.exportBackup();
      if (result.unreadable > 0) setMessage({ kind: 'info', text: t('backup.skipped', { count: result.unreadable }) });
    } catch (error) {
      setMessage({ kind: 'error', text: backupErrorText(t, error, 'export') });
    } finally {
      setPhase('idle');
    }
  };

  const restoreBackup = async () => {
    setMessage(null);
    setPhase('checking');
    try {
      const pending = await backup.chooseBackup(resumes.length);
      if (!pending) {
        setPhase('idle'); // the picker was closed: nothing happens, nothing is said
        return;
      }
      // The file is valid. Nothing changes until the user confirms, with both numbers in view.
      Alert.alert(
        t('backup.confirmTitle'),
        `${t('backup.confirmBody')}\n\n${t('backup.confirmCurrent', { count: pending.current })}\n${t('backup.confirmIncoming', { count: pending.incoming })}`,
        [
          { text: t('home.cancel'), style: 'cancel', onPress: () => setPhase('idle') },
          {
            text: t('backup.confirmReplace'),
            style: 'destructive',
            onPress: async () => {
              setPhase('restoring');
              try {
                const result = await backup.restore(pending);
                // The app language the backup carried is applied the usual way (the restart notice covers a direction change).
                if (result.appLanguage && result.appLanguage !== appLanguage) await setAppLanguage(result.appLanguage);
                setMessage({ kind: 'info', text: t('backup.restored', { count: result.resumes }) });
              } catch (error) {
                setMessage({ kind: 'error', text: backupErrorText(t, error, 'restore') });
              } finally {
                setPhase('idle');
              }
            },
          },
        ],
        { cancelable: true, onDismiss: () => setPhase('idle') },
      );
    } catch (error) {
      setMessage({ kind: 'error', text: backupErrorText(t, error, 'restore') });
      setPhase('idle');
    }
  };

  const progress = phase === 'exporting' ? t('backup.exporting') : phase === 'checking' ? t('backup.checking') : phase === 'restoring' ? t('backup.restoring') : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Muted>{t('backup.intro')}</Muted>
      <Card style={{ gap: 12 }}>
        <Button title={t('backup.export')} onPress={exportBackup} disabled={busy} loading={phase === 'exporting'} accessibilityHint={t('backup.exportHint')} />
        <Button
          title={t('backup.restore')}
          variant="secondary"
          onPress={restoreBackup}
          disabled={busy}
          loading={phase === 'checking' || phase === 'restoring'}
          accessibilityHint={t('backup.restoreHint')}
        />
      </Card>
      {progress ? (
        <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator />
          <Muted>{progress}</Muted>
        </View>
      ) : null}
      {message ? (
        <View accessibilityRole="alert">
          <Text style={{ color: message.kind === 'error' ? colors.danger : colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>{message.text}</Text>
        </View>
      ) : null}
      <Muted>{t('backup.privacy')}</Muted>
    </ScrollView>
  );
}
