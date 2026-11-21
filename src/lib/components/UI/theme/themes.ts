export type ThemeId = 'timber' | 'vellum';

export interface Theme {
  name: string;
  inkOnLit: boolean;
  surface: Record<string, string>;
  ink: Record<string, string>;
  emit: Record<string, string>;
  fonts: Record<string, string>;
}

export const THEMES: Record<ThemeId, Theme> = {
  timber: {
    name: 'Timber',
    inkOnLit: false,
    surface: {
      '--bg': '#120c07',
      '--bg-panel': '#24170c',
      '--bg-hover': '#33210f',
      '--bg-active': '#45301a',
      '--border': '#5a4026',
      '--border-hi': '#8a6a3e',
      '--tab-active': '#b8662a'
    },
    ink: {
      '--text': '#ecdcb4',
      '--text-dim': '#c2a678',
      '--text-muted': '#957c58',
      '--accent': '#d9822e',
      '--accent-hi': '#f2a444',
      '--pos': '#a4d070',
      '--neg': '#f0735a',
      '--cold': '#96c8ec'
    },
    emit: { '--ember': '#ffc466' },
    fonts: {
      '--font-head': "'Fantasia Block', var(--font-display)",
      '--head-case': 'uppercase',
      '--head-size': '1'
    }
  },
  vellum: {
    name: 'Vellum',
    inkOnLit: true,
    surface: {
      '--bg': '#cdb98c',
      '--bg-panel': '#e6d5ad',
      '--bg-hover': '#dcc79a',
      '--bg-active': '#cfb47f',
      '--border': '#8a7048',
      '--border-hi': '#5c4631',
      '--tab-active': '#a3271a'
    },
    ink: {
      '--text': '#2a1b10',
      '--text-dim': '#5c4631',
      '--text-muted': '#86704e',
      '--accent': '#a3271a',
      '--accent-hi': '#7e1d12',
      '--pos': '#36632a',
      '--neg': '#a3271a',
      '--cold': '#27467e'
    },
    emit: { '--ember': '#fff2cc' },
    fonts: {
      '--font-head': "'Fantasia Blackletter', var(--font-display)",
      '--head-case': 'none',
      '--head-size': '1.2'
    }
  }
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export const isThemeId = (v: string): v is ThemeId => v in THEMES;
