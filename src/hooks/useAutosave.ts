import { useEffect, useRef, useState } from 'react';
import { saveProject, type SaveStatus, type StoredProject } from '../lib/storage';

/**
 * Sauvegarde locale avec anti-rebond. Expose un statut pour l'indicateur
 * discret de la barre d'outils (rassure sans jamais demander d'action).
 */
export function useAutosave(data: StoredProject, delay = 500): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setStatus('saving');
    const id = window.setTimeout(() => setStatus(saveProject(data) ? 'saved' : 'error'), delay);
    return () => window.clearTimeout(id);
  }, [data, delay]);

  return status;
}
