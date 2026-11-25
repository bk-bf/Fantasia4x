import { uiTheme } from '$lib/stores/uiPrefs';
import { THEMES } from './themes';

if (typeof document !== 'undefined') {
  uiTheme.subscribe((id) => {
    const root = document.documentElement,
      t = THEMES[id];
    root.dataset.theme = id;
    for (const [k, v] of Object.entries({ ...t.surface, ...t.ink, ...t.emit, ...t.fonts }))
      root.style.setProperty(k, v);
  });
}
