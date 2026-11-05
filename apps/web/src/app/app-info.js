/** Shown on the sign-in page and in support conversations. Set at build time from package.json. */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.0.0';

export const PRODUCT_NAME = 'iHealth Pharmacy';

/** The pharmacy (or group) this installation serves, e.g. "Nairobi West Chemists". */
export const PHARMACY_NAME = import.meta.env.VITE_PHARMACY_NAME ?? PRODUCT_NAME;

/** Where the pharmacy operates; shown next to the version. */
export const PHARMACY_LOCATION = import.meta.env.VITE_PHARMACY_LOCATION ?? 'Nairobi';
