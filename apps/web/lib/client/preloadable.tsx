import { type ComponentType, lazy } from "react";

/**
 * A component whose code is fetched separately but shows without delay once that code
 * has arrived.
 *
 * `React.lazy` alone always suspends on first use, even when the module is already
 * downloaded, and React then holds the revealed content back for about 300 ms (its
 * protection against flickering fallbacks). For something opened by a click that is a
 * third of a second of nothing. Here the loaded component is kept in a variable and
 * rendered directly; `lazy` is only the fallback for a click that beats the download.
 */
export function preloadable<P extends object>(loader: () => Promise<ComponentType<P>>) {
  let Loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const preload = () =>
    (pending ??= loader().then(
      (c) => (Loaded = c),
      (err: unknown) => {
        pending = null; // a failed download can be tried again
        throw err;
      },
    ));
  const Lazy = lazy(() => preload().then((c) => ({ default: c })));
  function Preloadable(props: P) {
    const Impl = (Loaded ?? Lazy) as ComponentType<P>;
    return <Impl {...props} />;
  }
  return { Component: Preloadable, preload };
}
