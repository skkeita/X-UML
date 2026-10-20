import { useCallback, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

interface Props {
  left: ReactNode;
  right: ReactNode;
  leftOpen: boolean;
}

const MIN_LEFT = 260;
const MIN_RIGHT = 320;

/**
 * Écran partagé redimensionnable. Sur mobile (< md) les panneaux s'empilent.
 * UX : la poignée capture le pointeur → le glissement reste fluide même si la souris
 * quitte la poignée ou survole le canevas.
 */
export function SplitPane({ left, right, leftOpen }: Props) {
  const [width, setWidth] = useState(440);
  const container = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !container.current) return;
    const box = container.current.getBoundingClientRect();
    const max = box.width - MIN_RIGHT;
    setWidth(Math.min(Math.max(e.clientX - box.left, MIN_LEFT), Math.max(max, MIN_LEFT)));
  }, []);
  const onUp = () => {
    dragging.current = false;
  };

  return (
    <div ref={container} className="flex min-h-0 flex-1 flex-col md:flex-row" style={{ '--left-w': `${width}px` } as CSSProperties}>
      {leftOpen && (
        <>
          <section className="h-2/5 min-h-0 shrink-0 md:h-auto md:w-[var(--left-w)]">{left}</section>
          <div
            role="separator"
            aria-orientation="vertical"
            title="Glisser pour redimensionner"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="hidden w-1 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-indigo-400 active:bg-indigo-500 md:block dark:bg-slate-800"
          />
        </>
      )}
      <section className="min-h-0 min-w-0 flex-1">{right}</section>
    </div>
  );
}
