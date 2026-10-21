import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Change à chaque modification du diagramme : l'affichage réessaie tout seul. */
  resetKey: unknown;
  onUndo?: () => void;
}

/**
 * Filet de sécurité de l'affichage : si le dessin du diagramme échoue, seul le canevas affiche un
 * message (l'éditeur, les onglets et le travail restent intacts), au lieu d'une page blanche.
 * Le canevas réessaie dès que le diagramme change (déplacement suivant, annulation, frappe).
 */
export class ErrorBoundary extends Component<Props, { error: Error | null; key: unknown }> {
  state = { error: null as Error | null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: { error: Error | null; key: unknown }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error) {
    console.error('[X-UML] Affichage du diagramme interrompu :', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-sm text-slate-600 dark:text-slate-300">
        <p className="font-medium">Le diagramme n’a pas pu être affiché dans cet état.</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Votre travail est intact et enregistré. Annulez la dernière action pour revenir à l’état précédent.</p>
        {this.props.onUndo && (
          <button type="button" onClick={this.props.onUndo} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500">
            Annuler la dernière action (Ctrl+Z)
          </button>
        )}
      </div>
    );
  }
}
