import { getContext, onDestroy, setContext, type Snippet } from 'svelte';
import type { ModalId, WindowId } from '$lib/stores/uiState';

const KEY = Symbol('game-window');

export interface WindowBar {
  tabs?: Snippet;
  tools?: Snippet;
}

export interface WindowContext {
  id: WindowId | ModalId;
  close: () => void;
  bar: WindowBar;
}

export const provideWindow = (ctx: WindowContext): WindowContext => setContext(KEY, ctx);

export const currentWindow = (): WindowContext | undefined => getContext(KEY);

export function useWindowBar(bar: WindowBar): void {
  const win = currentWindow();
  if (!win) return;
  win.bar.tabs = bar.tabs;
  win.bar.tools = bar.tools;
  onDestroy(() => {
    win.bar.tabs = undefined;
    win.bar.tools = undefined;
  });
}
