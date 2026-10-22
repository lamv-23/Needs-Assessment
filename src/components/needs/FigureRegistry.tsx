'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export interface RegisteredFigure {
  id: string;
  title: string;
  /** Source text (the ChartWrapper `caption` prop), without the "Figure n." prefix. */
  caption: string;
  /** Registration sequence; figure numbers are the 1-based position by `order`. */
  order: number;
  /**
   * Renders the chart body (caption excluded) with html2canvas at scale 3. `widthPx`/`heightPx`
   * are the PNG's own pixel dimensions, i.e. 3x the on-screen size.
   */
  capture(): Promise<{ png: Uint8Array; widthPx: number; heightPx: number }>;
}

export interface FigureRegistry {
  register(f: Omit<RegisteredFigure, 'order'>): void;
  unregister(id: string): void;
  figures(): RegisteredFigure[];
  numberOf(id: string): number | null;
}

const FigureRegistryContext = createContext<FigureRegistry | null>(null);

/**
 * Collects the figures rendered beneath it so they can be numbered and exported in order.
 * Figures live in a ref; `register`/`unregister`/`figures`/`numberOf` are stable. The context
 * value changes identity only when the set of ids changes, which re-renders consumers so their
 * captions pick up new numbering.
 */
export function FigureRegistryProvider({ children }: { children: React.ReactNode }) {
  const store = useRef(new Map<string, RegisteredFigure>());
  const nextOrder = useRef(0);
  const [version, setVersion] = useState(0);

  const register = useCallback((f: Omit<RegisteredFigure, 'order'>) => {
    const existing = store.current.get(f.id);
    if (existing) {
      // Same figure with a new title/caption/capture: keep its place, no renumbering.
      store.current.set(f.id, { ...f, order: existing.order });
      return;
    }
    store.current.set(f.id, { ...f, order: nextOrder.current++ });
    setVersion((v) => v + 1);
  }, []);

  const unregister = useCallback((id: string) => {
    if (store.current.delete(id)) setVersion((v) => v + 1);
  }, []);

  const figures = useCallback(
    () => Array.from(store.current.values()).sort((a, b) => a.order - b.order),
    []
  );

  const numberOf = useCallback(
    (id: string) => {
      const index = figures().findIndex((f) => f.id === id);
      return index < 0 ? null : index + 1;
    },
    [figures]
  );

  const value = useMemo<FigureRegistry>(
    () => ({ register, unregister, figures, numberOf }),
    // `version` is the re-render trigger: figures live in a ref, so only the identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [register, unregister, figures, numberOf, version]
  );

  return <FigureRegistryContext.Provider value={value}>{children}</FigureRegistryContext.Provider>;
}

/** The nearest registry, or null outside a `FigureRegistryProvider`. */
export function useFigureRegistry(): FigureRegistry | null {
  return useContext(FigureRegistryContext);
}
