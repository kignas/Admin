/* ==========================================================================
   EATSWADA ADMIN — CENTRAL API CONFIGURATION
   Single source of truth for the backend host. Every request in this app
   goes through api.js, which reads CONFIG.API_BASE_URL — no other file may
   hardcode an API host.

   Current environment: Render (testing/staging backend).
   - Render API:  https://eatswada.onrender.com/api
   - Retired host (AWS production, kept only as documentation — NOT used):
     https://api.eatswada.com/api

   There is deliberately no fallback: if Render is unreachable the app shows
   a clear connection error instead of silently switching hosts.
   ========================================================================== */
const CONFIG = {
  API_BASE_URL: 'https://eatswada.onrender.com/api',
  ENVIRONMENT: 'render',
};
