"use client";

import { useSyncExternalStore } from "react";

/** Nothing to subscribe to — the value only differs between server and client. */
const noopSubscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * False while rendering on the server and during hydration, true afterwards.
 *
 * Components that portal into `document.body` need to know when there is a
 * body to portal into. The usual way to spell that is
 * `useState(false)` plus `useEffect(() => setMounted(true), [])`, which works
 * but sets state synchronously inside an effect — an extra render pass for
 * every mount, and something the React Compiler lint rightly objects to.
 * `useSyncExternalStore` answers the same question with no state and no effect.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, onClient, onServer);
}
