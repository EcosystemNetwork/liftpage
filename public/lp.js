/*
 * LiftPage tracking, for a client's own site. Add once, before </body>:
 *   <script src="https://YOUR-LIFTPAGE-DOMAIN/lp.js" data-key="lpk_..." async></script>
 * Then, where the site knows something happened:
 *   window.liftpage.lead({ email, name, company, id })        // sign-up, demo request
 *   window.liftpage.convert({ value: 49.99, currency: "usd", orderId, email })  // purchase
 * Calls made before the script loads are queued if you define
 *   window.liftpage = window.liftpage || { q: [] }  and push ["lead", {...}].
 *
 * Privacy: no cookies, no visitor id, no fingerprinting. Only landings tagged with a
 * LiftPage utm_campaign (lp-...) are reported, and that tag is remembered in this
 * browser's localStorage for 30 days so a later sign-up or sale can be credited to it.
 */
(function () {
  var script = document.currentScript;
  var key = script && script.getAttribute("data-key");
  if (!key) return;
  var endpoint = new URL("/api/track", script.src).toString();
  var STORE = "liftpage_touch";
  var DAYS = 30;

  function remembered() {
    try {
      var touch = JSON.parse(localStorage.getItem(STORE) || "null");
      if (touch && Date.now() - touch.at < DAYS * 864e5) return touch;
    } catch {}
    return null;
  }

  function send(kind, data) {
    var payload = { key: key, kind: kind, path: location.pathname };
    for (var name in data) if (Object.prototype.hasOwnProperty.call(data, name)) payload[name] = data[name];
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: "text/plain" }))) return;
    } catch {}
    try {
      fetch(endpoint, { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } });
    } catch {}
  }

  var query = new URLSearchParams(location.search);
  var campaign = query.get("utm_campaign") || "";
  if (/^lp-\d{8}-[0-9a-f]{6}$/.test(campaign)) {
    var touch = {
      campaign: campaign,
      source: query.get("utm_source") || "",
      medium: query.get("utm_medium") || "",
      content: query.get("utm_content") || "",
      at: Date.now(),
    };
    // Last LiftPage touch wins.
    try {
      localStorage.setItem(STORE, JSON.stringify(touch));
    } catch {}
    send("visit", { touch: touch });
  }

  var api = {
    lead: function (p) {
      p = p || {};
      send("lead", { touch: remembered(), email: p.email, name: p.name, company: p.company, id: p.id });
    },
    convert: function (p) {
      p = p || {};
      send("conversion", { touch: remembered(), value: p.value, currency: p.currency, id: p.orderId || p.id, email: p.email });
    },
  };
  var queued = (window.liftpage && window.liftpage.q) || [];
  window.liftpage = api;
  for (var i = 0; i < queued.length; i++) {
    var call = queued[i];
    if (call && api[call[0]]) api[call[0]](call[1]);
  }
})();
