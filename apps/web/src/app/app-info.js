/** The software's own name (the pharmacy's name comes from its record, via GET /app-info). */
export const PRODUCT_NAME = 'iHealth Pharmacy';

/** Web build version, set at build time from apps/web/package.json. */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.0.0';
