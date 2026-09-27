import { englishText } from '../../i18n/analysis';
import { text, type AnalysisText } from '../i18n/analysis-text';
import type { EditorSection } from '../resume/sections';
import type { AtsLocation } from './types';

// Places in the editor, as codes (analysis.location.*). `label` is the English rendering.

export function loc(section: EditorSection, labelText: AnalysisText): AtsLocation {
  return { section, label: englishText(labelText), labelText };
}

export type PersonalField = 'name' | 'email' | 'phone' | 'location' | 'linkedin' | 'website';
export const personal = (field: PersonalField) => loc('personal', text(`analysis.location.${field}`));

/** A whole section ("Experience", "Skills"). */
export const section = (s: EditorSection, key: 'experience' | 'education' | 'skills') => loc(s, text(`analysis.location.section.${key}`));

type EntrySection = 'experience' | 'education' | 'certifications' | 'projects';
const ENTRY: Record<EntrySection, string> = { experience: 'experience', education: 'education', certifications: 'certification', projects: 'project' };

const entryText = (s: EntrySection, index: number) => text(`analysis.location.entry.${ENTRY[s]}`, { n: index + 1 });

/** An entry ("Experience 2"). */
export const entry = (s: EntrySection, index: number) => loc(s, entryText(s, index));

/** A field of an entry ("Experience 2 · Job Title"). */
export const at = (s: EntrySection, index: number, field: AnalysisText) =>
  loc(s, text('analysis.location.inEntry', { entry: entryText(s, index), field }));

/** How a message refers to an item mid-sentence ("summary bullet 2"). */
export const reference = (key: string, params: Record<string, number>) => text(`analysis.reference.${key}`, params);
