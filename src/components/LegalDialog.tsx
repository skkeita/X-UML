import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CloseIcon } from './Icons';

/*
 * Informations légales du site (obligatoires) : mentions légales, confidentialité, licences.
 * Contenu rédigé pour un site personnel, non commercial, open source, hébergé sur GitHub Pages,
 * qui ne collecte aucune donnée. À relire si l'un de ces points change (publicité, compte, statistiques…).
 */

export type LegalTab = 'mentions' | 'confidentialite' | 'licences';

export const LEGAL_TABS: { id: LegalTab; label: string; hash: string }[] = [
  { id: 'mentions', label: 'Mentions légales', hash: '#mentions-legales' },
  { id: 'confidentialite', label: 'Confidentialité', hash: '#confidentialite' },
  { id: 'licences', label: 'Licences', hash: '#licences' },
];

const REPO = 'https://github.com/skkeita/X-UML';
const AUTHOR = 'skkeita';
const UPDATED = '28 octobre 2026';
/** Clés que l'application écrit dans le stockage du navigateur (voir l'onglet Confidentialité). */
export const STORAGE_KEYS = ['x-uml:project:v2', 'x-uml:project:v1', 'x-uml:versions:v1', 'x-uml:theme', 'x-uml:relation-mode', 'x-uml:editor-mode', 'x-uml:codegen-lang'];

const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-600 dark:text-indigo-300">
    {children}
  </a>
);

function H({ children }: { children: ReactNode }) {
  return <h3 className="mb-1.5 mt-6 text-[15px] font-semibold text-slate-900 first:mt-0 dark:text-white">{children}</h3>;
}
function P({ children }: { children: ReactNode }) {
  return <p className="mb-2 max-w-[68ch] text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">{children}</p>;
}

function Mentions() {
  return (
    <>
      <H>Éditeur</H>
      <P>
        X-UML est un projet personnel, gratuit et non commercial, édité à titre non professionnel par <A href="https://github.com/skkeita">{AUTHOR}</A>, également responsable
        de la publication.
      </P>
      <P>
        Conformément à l’article 1-1 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l’économie numérique (LCEN), l’éditeur, personne physique agissant à titre
        non professionnel, a choisi de ne pas rendre publique son identité ; ses éléments d’identification ont été communiqués à l’hébergeur.
      </P>

      <H>Contact</H>
      <P>
        Pour toute question, demande ou signalement : <A href={`${REPO}/issues`}>ouvrir une issue sur le dépôt GitHub du projet</A>.
      </P>

      <H>Hébergeur</H>
      <P>
        GitHub Pages, service de GitHub, Inc.
        <br />
        88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis
        <br />
        <A href="https://pages.github.com">pages.github.com</A>
      </P>

      <H>Propriété intellectuelle</H>
      <P>
        Le code source de X-UML est publié sous licence MIT (voir l’onglet Licences) et consultable sur <A href={REPO}>github.com/skkeita/X-UML</A>. Les diagrammes que vous créez
        vous appartiennent : l’éditeur n’y a aucun accès et ne revendique aucun droit dessus.
      </P>

      <H>Responsabilité</H>
      <P>
        X-UML est fourni « en l’état », sans garantie d’aucune sorte. Vos diagrammes étant enregistrés uniquement dans votre navigateur, pensez à exporter régulièrement vos projets
        importants (menu Exporter) : effacer les données de navigation ou changer d’ordinateur les fait disparaître.
      </P>
      <P>
        <span className="text-slate-500 dark:text-slate-400">Dernière mise à jour : {UPDATED}.</span>
      </P>
    </>
  );
}

function Confidentialite({ onExport }: { onExport: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const clear = () => {
    try {
      for (const k of STORAGE_KEYS) localStorage.removeItem(k);
    } catch {
      /* stockage indisponible : rien à effacer */
    }
    setDone(true);
    // Recharge sans l'ancre : l'application repart d'un projet neuf.
    window.setTimeout(() => window.location.replace(window.location.pathname), 600);
  };
  return (
    <>
      <H>En résumé</H>
      <P>X-UML ne collecte aucune donnée personnelle. Il n’y a ni compte, ni serveur applicatif, ni cookie, ni mesure d’audience, ni publicité.</P>

      <H>Ce qui reste dans votre navigateur</H>
      <P>
        Pour que votre travail ne soit pas perdu, l’application enregistre dans le stockage local de votre navigateur (localStorage) vos tableaux, leur disposition, l’historique de leurs versions
        (au plus 30 instantanés) et vos préférences d’affichage (thème clair ou sombre, mode Code ou Visuel, langage de génération de code). Ces informations ne quittent jamais votre ordinateur, sauf si vous les exportez vous-même. Les fichiers que vous
        importez sont lus directement dans le navigateur, sans être envoyés nulle part.
      </P>
      <P>
        Ce stockage est strictement nécessaire au service que vous utilisez (enregistrer vos diagrammes et vos réglages) : il est dispensé de consentement selon les
        recommandations de la CNIL, c’est pourquoi aucun bandeau ne vous est présenté.
      </P>

      <H>Liens de partage</H>
      <P>
        Quand vous copiez un lien de partage, le diagramme est compressé et placé dans le fragment de l’adresse (la partie après « #d= »). Ce fragment n’est jamais transmis au
        serveur par le navigateur : le diagramme voyage uniquement dans le lien, et seules les personnes à qui vous l’envoyez peuvent l’ouvrir. Ne partagez donc pas par lien un
        diagramme confidentiel sur un canal public.
      </P>

      <H>Hébergement</H>
      <P>
        Le site est servi par GitHub Pages. Comme tout hébergeur, GitHub peut enregistrer des informations techniques (dont l’adresse IP des visiteurs) pour assurer la sécurité et le
        bon fonctionnement du service ; l’éditeur n’y a pas accès. Voir la{' '}
        <A href="https://docs.github.com/fr/site-policy/privacy-policies/github-general-privacy-statement">déclaration de confidentialité de GitHub</A>.
      </P>
      <P>Aucune autre ressource externe n’est chargée : les polices de caractères et toutes les bibliothèques sont incluses dans l’application.</P>

      <H>Vos droits</H>
      <P>
        L’éditeur ne détenant aucune donnée vous concernant, il n’a rien à vous communiquer, rectifier ou supprimer. Vous restez maître des données de votre navigateur : vous pouvez
        les effacer ci-dessous ou via les réglages de votre navigateur. Pour les données traitées par l’hébergeur, adressez-vous à GitHub. Vous pouvez aussi saisir la{' '}
        <A href="https://www.cnil.fr/fr/plaintes">CNIL</A>.
      </P>

      <div className="mt-4 max-w-[68ch] rounded-lg border border-slate-200 p-3 dark:border-slate-700">
        <p className="text-[14px] font-medium text-slate-900 dark:text-white">Effacer les données de X-UML dans ce navigateur</p>
        <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-400">Supprime tous vos tableaux, leur historique et vos préférences. Exportez d’abord votre projet si vous voulez le garder.</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" onClick={onExport} className="rounded-md border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800">
            Exporter le projet
          </button>
          {done ? (
            <span className="self-center text-[13px] text-slate-600 dark:text-slate-300" role="status">
              Données effacées. Rechargement…
            </span>
          ) : confirm ? (
            <>
              <button type="button" onClick={clear} className="rounded-md bg-red-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-red-700">
                Oui, tout effacer
              </button>
              <button type="button" onClick={() => setConfirm(false)} className="rounded-md px-3 py-1.5 text-[13px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                Annuler
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="rounded-md border border-red-200 px-3 py-1.5 text-[13px] font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-500/10">
              Effacer les données…
            </button>
          )}
        </div>
      </div>
    </>
  );
}

const THIRD_PARTY: { name: string; licence: string; holder: string; url: string }[] = [
  { name: 'React, React DOM, Scheduler', licence: 'MIT', holder: 'Meta Platforms, Inc. et contributeurs', url: 'https://github.com/facebook/react' },
  { name: 'jsPDF', licence: 'MIT', holder: 'James Hall, yWorks GmbH et contributeurs', url: 'https://github.com/parallax/jsPDF' },
  { name: 'Dépendances de jsPDF (fflate, canvg, html2canvas, DOMPurify, core-js…)', licence: 'MIT (DOMPurify : MPL-2.0 ou Apache-2.0)', holder: 'leurs auteurs respectifs', url: 'third-party-licenses.txt' },
  { name: 'IBM Plex Sans et IBM Plex Mono', licence: 'SIL Open Font License 1.1', holder: 'IBM Corp.', url: 'https://github.com/IBM/plex' },
];

function Licences() {
  return (
    <>
      <H>X-UML</H>
      <P>
        Copyright © 2026 {AUTHOR}. Publié sous licence MIT : vous pouvez utiliser, copier, modifier et redistribuer le code, y compris à des fins commerciales, à condition de conserver
        la mention de copyright et le texte de la licence. Le logiciel est fourni sans garantie. <A href={`${REPO}/blob/main/LICENSE`}>Texte complet de la licence</A>.
      </P>

      <H>Composants open source inclus</H>
      <ul className="mb-2 max-w-[68ch] divide-y divide-slate-100 text-[14px] dark:divide-slate-800">
        {THIRD_PARTY.map((t) => (
          <li key={t.name} className="py-2">
            <span className="font-medium text-slate-900 dark:text-white">{t.name}</span>
            <span className="text-slate-600 dark:text-slate-400"> — {t.licence}, © {t.holder}. </span>
            <A href={t.url}>{t.url.startsWith('http') ? 'Source' : 'Licence'}</A>
          </li>
        ))}
      </ul>
      <P>
        Le texte intégral de chaque licence, généré à partir des composants réellement livrés, est disponible ici :{' '}
        <A href="third-party-licenses.txt">third-party-licenses.txt</A>.
      </P>
    </>
  );
}

/** Fenêtre « Informations légales ». Fermeture par Échap, clic à côté ou la croix. */
export function LegalDialog({ tab, onTab, onClose, onExport }: { tab: LegalTab; onTab: (t: LegalTab) => void; onClose: () => void; onExport: () => void }) {
  const previous = useRef<Element | null>(null);
  useEffect(() => {
    previous.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (previous.current instanceof HTMLElement) previous.current.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-[2px] sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Informations légales"
        className="flex h-full max-h-[760px] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 pt-3 dark:border-slate-800">
          <div role="tablist" aria-label="Informations légales" className="flex gap-1">
            {LEGAL_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => onTab(t.id)}
                className={`-mb-px border-b-2 px-3 pb-2.5 pt-1 text-[14px] font-medium ${
                  tab === t.id
                    ? 'border-indigo-600 text-slate-900 dark:border-indigo-400 dark:text-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer (Échap)"
            className="mb-2 ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <CloseIcon size={16} />
          </button>
        </header>
        <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {tab === 'mentions' && <Mentions />}
          {tab === 'confidentialite' && <Confidentialite onExport={onExport} />}
          {tab === 'licences' && <Licences />}
        </div>
      </div>
    </div>
  );
}
