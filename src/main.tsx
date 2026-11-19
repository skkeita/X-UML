import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Intro } from './components/Intro';
// Polices embarquées (aucun appel réseau : l'application reste utilisable hors ligne).
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* Planche d'entrée : un voile par-dessus l'éditeur, qui se charge derrière sans attendre. */}
    <Intro />
  </StrictMode>,
);
