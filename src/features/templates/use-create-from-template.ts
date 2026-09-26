import { router } from 'expo-router';
import { useCallback } from 'react';
import { emptyResume } from '../../domain/resume/types';
import { useResumeStore } from '../../services/storage/resume-store';

/**
 * Creates a blank resume with the chosen template (and its default accent), then
 * opens the editor with Home underneath, so Back from the editor returns to Home.
 */
export function useCreateFromTemplate(): (templateId: string) => void {
  const { create } = useResumeStore();
  return useCallback(
    (templateId: string) => {
      const resume = create(emptyResume(), 'Untitled resume', templateId);
      router.dismissAll();
      router.push({ pathname: '/resume/[id]', params: { id: resume.id } });
    },
    [create],
  );
}

export const templateHref = (templateId: string) => ({ pathname: '/templates/[templateId]' as const, params: { templateId } });
