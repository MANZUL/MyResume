import type { Language } from '../../domain/i18n/languages';

// When the app language needs the other layout direction (Arabic is right-to-left, the other
// four are left-to-right), React Native applies the change only after the app is closed and
// opened again. The app never restarts itself and never reloads in a loop: it only tells the
// user, once per language, wherever they are. The notice is not needed once the layout already
// matches (restartPending is false again after the restart), and the Language screen shows the
// same message inline, so the global notice is hidden there.

export interface RestartNoticeState {
  /** The layout direction does not match the app language yet. */
  restartPending: boolean;
  appLanguage: Language;
  /** The language the user already dismissed the notice for, in this run of the app. */
  dismissedFor: Language | null;
  /** The Language screen is open (it has its own inline message). */
  onLanguageScreen: boolean;
}

export function restartNoticeVisible(state: RestartNoticeState): boolean {
  return state.restartPending && state.dismissedFor !== state.appLanguage && !state.onLanguageScreen;
}
