/* ==========================================================================
   EATSWADA ADMIN — CENTRAL API CONFIGURATION
   Single source of truth for the backend host. Every request in this app
   goes through api.js, which reads CONFIG.API_BASE_URL — no other file may
   hardcode an API host.

   Current environment: AWS production API.
   There is deliberately no fallback: if AWS is unreachable the app shows
   a clear connection error instead of silently switching hosts.
   ========================================================================== */
const CONFIG = {
  API_BASE_URL: 'https://api.eatswada.com/api',
  ENVIRONMENT: 'aws',
};
