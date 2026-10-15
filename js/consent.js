/* consent.js — lightweight cookie-consent banner for all site pages.
 * Stores choice in localStorage. Analytics (e.g. Google Analytics) and other
 * non-essential scripts must check BK.consentGranted() before loading. */
(function () {
  window.BK = window.BK || {};
  var KEY = 'bk_consent'; // 'all' | 'essential'

  function get() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  BK.consentGranted = function () { return get() === 'all'; };
  BK.openConsent = function () { render(true); };

  function dismiss(el) { el.classList.add('out'); setTimeout(function () { if (el.parentNode) el.remove(); }, 350); }

  function render(force) {
    if (!force && get()) return;             // already chosen
    if (document.getElementById('bkConsent')) return;
    var b = document.createElement('div');
    b.id = 'bkConsent'; b.className = 'bk-consent';
    b.innerHTML =
      '<div class="bk-consent-in">' +
        '<p>We use essential cookies to run Vozimi. With your consent we may also use analytics to improve the product. ' +
        'See our <a href="cookies.html">Cookie Policy</a>.</p>' +
        '<div class="bk-consent-btns">' +
          '<button class="bk-c-decline" id="bkDecline">Decline</button>' +
          '<button class="bk-c-accept" id="bkAccept">Accept all</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(b);
    document.getElementById('bkAccept').onclick = function () { set('all'); dismiss(b); if (BK.onConsent) BK.onConsent('all'); };
    document.getElementById('bkDecline').onclick = function () { set('essential'); dismiss(b); };
  }

  // show after a short delay so it does not fight first paint
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(render, 600); });
  else setTimeout(render, 600);

  /* When Google Analytics is added later, load it only on consent, e.g.:
     BK.onConsent = function(){ if (BK.consentGranted()) loadGA(); };
     if (BK.consentGranted()) loadGA();                                        */
})();
