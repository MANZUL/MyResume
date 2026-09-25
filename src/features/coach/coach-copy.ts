import type { CoachCategory } from '../../domain/coach/types';

// Writing Coach copy. Group names follow the web editor's improvement actions.

export const CATEGORY_LABELS: Record<CoachCategory, string> = {
  concise: 'Make concise',
  professional: 'More professional',
  impact: 'Strengthen impact',
  measurable: 'Add measurable impact',
  grammar: 'Fix grammar',
};

export const CATEGORY_ORDER: readonly CoachCategory[] = ['grammar', 'concise', 'professional', 'impact', 'measurable'];

export const COACH_COPY = {
  open: 'Coach',
  locked: 'Coach 🔒',
  close: 'Hide Coach',
  apply: 'Apply',
  refresh: 'Refresh suggestions',
  stale: 'The text changed since these suggestions were made.',
  none: 'No suggestions for this text.',
  empty: 'Add text first.',
  note: 'Suggestions only: the Coach never adds facts, numbers or skills. Review every change.',
} as const;
