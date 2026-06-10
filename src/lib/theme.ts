// theme.ts — Theme management utilities
// The active theme is stored in uiStore and applied via CSS custom properties.
// This file provides helpers for theme switching.

export type Theme = "dark" | "light" | "monokai";

export const THEMES: { id: Theme; label: string }[] = [
  { id: "dark",    label: "Dark (Default)" },
  { id: "monokai", label: "Monokai" },
];

export function applyTheme(_theme: Theme) {
  // Currently the IDE uses a single dark theme defined in global.css.
  // Future: swap CSS custom properties based on theme here.
}
