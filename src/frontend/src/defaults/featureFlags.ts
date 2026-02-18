/**
 * Central frontend feature flags for top-level modules.
 * Toggle values to enable / disable modules without deleting code.
 */
export const ENABLED_MODULES = {
  dashboard: true,
  parts: true,
  stock: true,
  manufacturing: false,
  purchasing: false,
  sales: false,
  events: true,
  rentals: true
} as const;

export type ModuleFlag = keyof typeof ENABLED_MODULES;

export function isModuleEnabled(module: ModuleFlag): boolean {
  return ENABLED_MODULES[module] === true;
}
