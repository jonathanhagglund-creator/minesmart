/* MineSmart – hämtar live-data i besökarens webbläsare. Varje värde bär källa + tidpunkt. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MSLive = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var AREAS = ["SE1", "SE2", "SE3", "SE4"];
  var SPOT_SOURCE = "elprisetjustnu.se (Nord Pool, exkl. moms)";
  var PRICE_SOURCE = "CoinGecko";
  var NET_SOURCE = "xmrchain.net";

  function fetchJson(url, timeoutMs) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 8000) : null;
    return fetch(url, { signal: ctrl ? ctrl.signal : undefined, headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) { var e = new Error("HTTP " + r.status); e.status = r.status; throw e; }
        return r.json();
      })
      .finally(function () { if (t) clearTimeout(t); });
  }

  function stockholmDate(d) {
    // ÅÅÅÅ-MM-DD i svensk tid
    var parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric",
      month: "2-digit", day: "2-digit" }).formatToParts(d || new Date());
    var get = function (t) { return parts.filter(function (p) { return p.type === t; })[0].value; };
    return get("year") + "-" + get("month") + "-" + get("day");
  }

  function spotUrl(area, isoDate) {
    if (AREAS.indexOf(area) < 0) throw new Error("Okänt elområde");
    var p = isoDate.split("-");
    return "https://www.elprisetjustnu.se/api/v1/prices/" + p[0] + "/" + p[1] + "-" + p[2] + "_" + area + ".json";
  }

  function parseSpot(payload, area, fetchedAt) {
    if (!Array.isArray(payload) || !payload.length) throw new Error("Inga elpriser i svaret");
    var iv = payload.map(function (r) {
      var s = new Date(r.time_start), e = new Date(r.time_end), p = Number(r.SEK_per_kWh);
      if (isNaN(s) || isNaN(e) || e <= s || !isFinite(p)) throw new Error("Oväntat format på elprisdata");
      return { start: s, end: e, price: p };
    }).sort(function (a, b) { return a.start - b.start; });
    var totalMs = 0, weighted = 0;
    iv.forEach(function (x) { var ms = x.end - x.start; totalMs += ms; weighted += x.price * ms; });
    return {
      area: area, intervals: iv, average: weighted / totalMs, fetchedAt: fetchedAt || new Date(),
      source: SPOT_SOURCE,
      at: function (when) {
        for (var k = 0; k < iv.length; k++) if (iv[k].start <= when && when < iv[k].end) return iv[k];
        return null;
      }
    };
  }

  function parsePrice(payload) {
    var m = payload && payload.monero;
    var p = m && Number(m.sek);
    if (!p || !isFinite(p) || p <= 0) throw new Error("Oväntat svar från CoinGecko");
    return { value: p, source: PRICE_SOURCE,
             timestamp: m.last_updated_at ? new Date(m.last_updated_at * 1000) : new Date() };
  }

  function parseNetwork(payload) {
    var d = payload && payload.status === "success" && payload.data;
    var diff = d && Number(d.difficulty);
    if (!diff || !isFinite(diff) || diff <= 0) throw new Error("Oväntat svar från block explorer");
    return { value: diff, source: NET_SOURCE + (d.height ? " (block " + d.height + ")" : ""), timestamp: new Date() };
  }

  return {
    AREAS: AREAS, stockholmDate: stockholmDate, spotUrl: spotUrl,
    parseSpot: parseSpot, parsePrice: parsePrice, parseNetwork: parseNetwork,
    spot: function (area, isoDate) {
      return fetchJson(spotUrl(area, isoDate || stockholmDate())).then(function (j) { return parseSpot(j, area, new Date()); });
    },
    xmrPrice: function () {
      return fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=sek&include_last_updated_at=true")
        .then(parsePrice);
    },
    difficulty: function () {
      return fetchJson("https://xmrchain.net/api/networkinfo").then(parseNetwork);
    }
  };
});
