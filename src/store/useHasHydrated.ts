import { useEffect, useState } from 'react';

interface PersistApi {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (cb: () => void) => () => void;
    rehydrate: () => unknown;
  };
}

/**
 * True once a persist-backed Zustand store has finished restoring from
 * localStorage on the client. Always false during SSR and on the client's
 * first paint, so components can render the store's un-hydrated defaults
 * consistently for both — matching server output and avoiding a hydration
 * mismatch — then swap in the real persisted values after mount.
 */
export function useHasHydrated(store: PersistApi): boolean {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const unsub = store.persist.onFinishHydration(() => setHasHydrated(true));
    if (store.persist.hasHydrated()) {
      setHasHydrated(true);
    } else {
      store.persist.rehydrate();
    }
    return unsub;
  }, [store]);

  return hasHydrated;
}
