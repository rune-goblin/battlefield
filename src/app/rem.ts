/** A size set from script, on the same base as the stylesheets' `rem` (see `appRem` in vite.config.ts). */
export const rem = (n: number) => `calc(${n} * var(--rem, 1rem))`;
