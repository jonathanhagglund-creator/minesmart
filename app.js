/* MineSmart – kalkylatorsidan. Kräver calc.js och live.js. */
(function () {
  "use strict";
  var C = window.MSCalc, L = window.MSLive;
  var form = document.getElementById("calc");
  if (!form) return;
  var out = document.getElementById("results");
  var STORE_KEY = "minesmart.inputs.v1";
  var PERSIST = ["area", "spotMode", "markup", "grid", "tax", "vat", "hashrate", "power", "idle", "poolFee", "hwCost"];
  var LIVE_FIELDS = { spot: true, xmrPrice: true, difficulty: true };
  var live = { spot: null, spotDay: null, xmrPrice: null, difficulty: null };
  var errors = {};

  var nf = function (d) { return new Intl.NumberFormat("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }); };
  function fmt(x, d) { return x === null || x === undefined || !isFinite(x) ? "–" : nf(d === undefined ? 2 : d).format(x); }
  function kr(x, d) { return x === null || x === undefined ? "–" : fmt(x, d) + " kr"; }
  function time(d) { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" }).format(d); }
  function hashStr(h) {
    if (!isFinite(h)) return "–";
    var u = [["GH/s", 1e9], ["MH/s", 1e6], ["kH/s", 1e3]];
    for (var i = 0; i < u.length; i++) if (h >= u[i][1]) return fmt(h / u[i][1], 2) + " " + u[i][0];
    return fmt(h, 0) + " H/s";
  }
  function $(id) { return document.getElementById(id); }
  function val(id) { var el = $(id); return el ? el.value.trim() : ""; }

  // ---------- spara/läsa egna värden (bara i den här webbläsaren)
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      PERSIST.forEach(function (k) { if (s[k] !== undefined && $(k)) $(k).value = s[k]; });
    } catch (e) { /* lagring kan vara avstängd – inget problem */ }
  }
  function save() {
    try {
      var s = {};
      PERSIST.forEach(function (k) { if ($(k)) s[k] = $(k).value; });
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch (e) { /* ignorera */ }
  }

  // ---------- källa/badge per fält
  function setSource(id, kind, text) {
    var el = $("src-" + id);
    if (!el) return;
    var label = { live: "Live", manual: "Eget värde", estimate: "Uppskattning", missing: "Saknas" }[kind] || kind;
    el.innerHTML = '<span class="badge ' + (kind === "missing" ? "" : kind) + '">' + label + "</span> " + (text || "");
  }

  function fillLive(id, value, decimals, sourceText) {
    var el = $(id);
    if (el.dataset.userEdited === "1") return;
    el.value = String(Number(value.toFixed(decimals)));
    el.dataset.liveValue = el.value;
    setSource(id, sourceText.kind || "live", sourceText.text);
  }

  form.addEventListener("input", function (e) {
    var id = e.target.id;
    if (LIVE_FIELDS[id]) {
      var isLive = e.target.dataset.liveValue !== undefined && e.target.value === e.target.dataset.liveValue;
      e.target.dataset.userEdited = isLive ? "0" : "1";
      if (!isLive) setSource(id, e.target.value === "" ? "missing" : "manual", e.target.value === "" ? "" : "Inmatat av dig");
    }
    if (id === "spotMode") applySpot();
    save();
    render();
  });
  $("area").addEventListener("change", function () {
    $("spot").dataset.userEdited = "0";
    fetchSpot();
  });

  // ---------- hämta live-data
  function applySpot() {
    var d = live.spotDay;
    if (!d) return;
    var mode = val("spotMode");
    if (mode === "now") {
      var iv = d.at(new Date());
      if (iv) {
        fillLive("spot", iv.price, 3, { kind: "live", text: d.source + ", " + d.area + ", " +
          time(iv.start) + "–" + new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", timeStyle: "short" }).format(iv.end) });
        return;
      }
    }
    fillLive("spot", d.average, 3, { kind: "estimate", text: "Dygnsmedel " + d.area + " i dag – " + d.source + ", hämtat " + time(d.fetchedAt) });
  }

  function fetchSpot() {
    setSource("spot", "missing", "Hämtar elpris…");
    L.spot(val("area")).then(function (d) {
      live.spotDay = d; delete errors.spot; applySpot(); render();
    }).catch(function (e) {
      errors.spot = "Elpriset kunde inte hämtas (" + e.message + "). Fyll i spotpriset själv.";
      setSource("spot", "missing", "Kunde inte hämtas – fyll i själv");
      render();
    });
  }
  function fetchPrice() {
    L.xmrPrice().then(function (p) {
      delete errors.xmrPrice;
      fillLive("xmrPrice", p.value, 2, { kind: "live", text: p.source + ", " + time(p.timestamp) }); render();
    }).catch(function (e) {
      errors.xmrPrice = "XMR-priset kunde inte hämtas (" + e.message + "). Fyll i det själv.";
      setSource("xmrPrice", "missing", "Kunde inte hämtas – fyll i själv"); render();
    });
  }
  function fetchDifficulty() {
    L.difficulty().then(function (p) {
      delete errors.difficulty;
      fillLive("difficulty", p.value, 0, { kind: "live", text: p.source + ", " + time(p.timestamp) }); render();
    }).catch(function (e) {
      errors.difficulty = "Nätverkets difficulty kunde inte hämtas (" + e.message + "). Hämta värdet från en Monero block explorer och fyll i det.";
      setSource("difficulty", "missing", "Kunde inte hämtas – fyll i själv"); render();
    });
  }

  // ---------- räkna och visa
  function render() {
    var notes = [];
    Object.keys(errors).forEach(function (k) { notes.push(errors[k]); });
    ["markup", "grid", "tax"].forEach(function (k) {
      if (val(k) === "") notes.push("Elpriset är underskattat tills du fyllt i " +
        { markup: "elhandelspåslag", grid: "elnätsavgift", tax: "energiskatt" }[k] + " (står på din elräkning).");
    });
    var res, el;
    Array.prototype.forEach.call(form.querySelectorAll("input"), function (i) { i.removeAttribute("aria-invalid"); });
    try {
      el = C.electricity({ spot: val("spot"), markup: val("markup") || 0, grid: val("grid") || 0,
                           tax: val("tax") || 0, vat: (Number(val("vat") || 25)) / 100 });
      res = C.calculate({
        hashrate: val("hashrate"), power: val("power"), idle: val("idle") || 0,
        electricityPrice: el.total, xmrPrice: val("xmrPrice"), difficulty: val("difficulty"),
        poolFee: (Number(String(val("poolFee") || 0).replace(",", "."))) / 100, hardwareCost: val("hwCost") || 0
      });
    } catch (e) {
      if (!(e instanceof C.ValidationError)) throw e;
      out.innerHTML = '<div class="verdict info">Fyll i fälten till vänster för att se resultatet. <br><span class="small">' +
        escapeHtml(e.message) + "</span></div>" + notesHtml(notes);
      return;
    }
    var d = res.day, m = res.month, y = res.year;
    var verdict = res.profitable
      ? '<div class="verdict ok">✅ Lönsamt just nu: ' + kr(d.net) + " per dygn</div>"
      : '<div class="verdict bad">❌ Inte lönsamt just nu: ' + kr(d.net) + " per dygn. Elen kostar mer än minandet ger.</div>";
    var be = res.breakEvenPrice;
    var rows = [
      ["Intäkt (efter poolavgift)", d.revenue, m.revenue, y.revenue],
      ["Elkostnad", -d.cost, -m.cost, -y.cost],
      ["<strong>Nettovinst</strong>", d.net, m.net, y.net]
    ];
    out.innerHTML = verdict +
      '<div class="kpis">' +
        kpi("Netto / dygn", d.net) + kpi("Netto / månad", m.net, 0) + kpi("Netto / år", y.net, 0) +
      "</div>" +
      "<table><thead><tr><th></th><th>Dygn</th><th>Månad</th><th>År</th></tr></thead><tbody>" +
      rows.map(function (r) {
        return "<tr><td>" + r[0] + "</td>" + r.slice(1).map(function (v) {
          return '<td class="' + (v < 0 ? "neg" : "") + '">' + fmt(v, Math.abs(v) >= 100 ? 0 : 2) + "</td>"; }).join("") + "</tr>";
      }).join("") +
      "<tr><td>XMR</td><td>" + fmt(d.xmr, 6) + "</td><td>" + fmt(m.xmr, 5) + "</td><td>" + fmt(y.xmr, 4) + "</td></tr>" +
      "<tr><td>Energi (kWh)</td><td>" + fmt(d.kwh, 2) + "</td><td>" + fmt(m.kwh, 0) + "</td><td>" + fmt(y.kwh, 0) + "</td></tr>" +
      "</tbody></table>" +
      "<h3>Nyckeltal</h3><table><tbody>" +
      "<tr><td>Ditt elpris totalt, inkl. moms</td><td>" + fmt(el.total, 3) + " kr/kWh</td></tr>" +
      "<tr><td>Elpris där du går jämnt upp (allt inräknat)</td><td>" + (be === null ? "∞" : fmt(be, 3) + " kr/kWh") + "</td></tr>" +
      "<tr><td>Spotpris där du går jämnt upp</td><td>" + (be === null ? "∞" : fmt(el.spotForTotal(be), 3) + " kr/kWh") + "</td></tr>" +
      "<tr><td>Återbetalningstid för hårdvaran</td><td>" +
        (res.paybackDays === null ? "Aldrig (förlust)" : res.paybackDays === 0 ? "–" : fmt(res.paybackDays, 0) + " dagar") + "</td></tr>" +
      "<tr><td>Nätverkets hashrate</td><td>" + hashStr(res.networkHashrate) + "</td></tr>" +
      "</tbody></table>" +
      notesHtml(notes.concat(["Intäkten är ett statistiskt genomsnitt. Blockbelöning 0,6 XMR enligt Moneros protokoll; transaktionsavgifter är inte medräknade."]));
  }
  function kpi(label, v, d) {
    return '<div class="kpi"><div class="label">' + label + '</div><div class="value ' + (v >= 0 ? "pos" : "neg") + '">' + kr(v, d) + "</div></div>";
  }
  function notesHtml(n) { return n.length ? '<ul class="notes">' + n.map(function (x) { return "<li>" + escapeHtml(x) + "</li>"; }).join("") + "</ul>" : ""; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  load();
  ["spot", "xmrPrice", "difficulty"].forEach(function (k) { setSource(k, "missing", "Hämtar…"); });
  render();
  fetchSpot(); fetchPrice(); fetchDifficulty();
})();
