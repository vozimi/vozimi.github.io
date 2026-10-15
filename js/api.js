/* api.js — the single way the frontend talks to the GAS backend.
 * Uses Content-Type: text/plain to stay a CORS "simple request" (no preflight;
 * GAS can't answer preflight). Body is JSON. See docs/ARCHITECTURE.md. */
(function () {
  function token() { try { return localStorage.getItem('bk_token') || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? localStorage.setItem('bk_token', t) : localStorage.removeItem('bk_token'); } catch (e) {} }

  // Reads and the stateless AI calls are safe to retry automatically on a transient
  // network blip (a thrown fetch means the request almost never reached the server).
  // Writes (create/update/delete/...) are NOT retried, to avoid duplicate records.
  function isRetryable(action) {
    return /^(list|get|summary|interpret)/.test(action) ||
      /^(me|health|reauth|dueReminders|duesSummary|notifications|billingInfo|myTickets|ticketThread|adminStats|adminUserDetail|adminPayments|adminAuditLog|adminAiUsage|adminListUsers|adminListTickets|listAnnouncements)$/.test(action);
  }
  var REQUEST_TIMEOUT = 45000; // cold start + an AI round-trip can take a while

  async function once(base, action, payload) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT) : null;
    var res;
    try {
      res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, token: token(), payload: payload || {} }),
        redirect: 'follow',
        signal: ctrl ? ctrl.signal : undefined
      });
    } catch (netErr) {
      if (timer) clearTimeout(timer);
      var offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
      var e2 = new Error(offline ? 'You appear to be offline.' : 'Network error. Please check your connection and try again.');
      e2.code = offline ? 'OFFLINE' : 'NETWORK';
      throw e2;
    }
    if (timer) clearTimeout(timer);
    var json;
    try { json = await res.json(); }
    catch (parseErr) { var e3 = new Error('Bad response from backend'); e3.code = 'BAD_RESPONSE'; throw e3; }
    if (!json.ok) {
      var err = new Error(json.error || 'Request failed');
      err.code = json.code || 'ERROR';
      if (err.code === 'UNAUTHORIZED') { setToken(''); }
      throw err;
    }
    return json.data;
  }

  async function call(action, payload) {
    var base = BK.apiBase();
    if (!base) { var e = new Error('Backend not configured'); e.code = 'NO_BACKEND'; throw e; }
    try {
      return await once(base, action, payload);
    } catch (err) {
      // One retry, after a short backoff, only for safe actions and only on a transient blip.
      if (err && err.code === 'NETWORK' && isRetryable(action)) {
        await new Promise(function (r) { setTimeout(r, 700); });
        return await once(base, action, payload);
      }
      throw err;
    }
  }

  BK.api = {
    call: call,
    token: token,
    setToken: setToken,
    isAuthed: function () { return !!token(); },
    async login(email, password) {
      var data = await call('login', { email: email, password: password });
      setToken(data.token);
      return data.user;
    },
    logout() { setToken(''); }
  };
})();
