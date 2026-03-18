import type { ServerAPIProps } from '../states/states';

export function purchasingEnabled(server: ServerAPIProps): boolean {
  return !!server?.feature_flags?.enable_purchasing;
}

export function manufacturingEnabled(server: ServerAPIProps): boolean {
  return !!server?.feature_flags?.enable_manufacturing;
}

export function salesEnabled(server: ServerAPIProps): boolean {
  return !!server?.feature_flags?.enable_sales;
}

