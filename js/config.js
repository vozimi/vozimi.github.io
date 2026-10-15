/* Shared config + brand tokens. Keep brand values in sync with /config/brand.json. */
window.BK = window.BK || {};

BK.brand = {
  name: 'Vozimi',
  tagline: "A builder's ledger, by voice.",
  currency: { code: 'INR', symbol: '₹', locale: 'en-IN' }
};

/* Backend URL.
 * Hardcoded to the deployed Apps Script /exec endpoint. The webapp AND the Android TWA
 * (which loads this same webapp) both use this. A value saved in the browser's localStorage
 * via Settings still overrides it. */
BK.DEFAULT_API_BASE = 'https://api.vozimi.com';

BK.apiBase = function () {
  try { return localStorage.getItem('bk_api') || BK.DEFAULT_API_BASE || ''; }
  catch (e) { return BK.DEFAULT_API_BASE || ''; }
};
BK.setApiBase = function (url) {
  try { localStorage.setItem('bk_api', String(url || '').trim()); } catch (e) {}
};

/* currency formatter */
BK.money = function (n) {
  n = Number(n) || 0;
  try { return BK.brand.currency.symbol + n.toLocaleString(BK.brand.currency.locale, { maximumFractionDigits: 0 }); }
  catch (e) { return BK.brand.currency.symbol + Math.round(n); }
};
