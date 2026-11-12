/* MineSmart – elprissidan: dagens spotpriser för valt elområde. */
(function () {
  "use strict";
  var L = window.MSLive;
  var sel = document.getElementById("area");
  var box = document.getElementById("prices");
  if (!sel || !box) return;
  var tz = "Europe/Stockholm";
  var hm = new Intl.DateTimeFormat("sv-SE", { timeZone: tz, timeStyle: "short" });
  var nf = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  try { var saved = localStorage.getItem("minesmart.area"); if (saved) sel.value = saved; } catch (e) {}

  function show() {
    var area = sel.value;
    try { localStorage.setItem("minesmart.area", area); } catch (e) {}
    box.innerHTML = '<p class="muted">Hämtar dagens priser för ' + area + "…</p>";
    L.spot(area).then(function (d) {
      var now = new Date(), cur = d.at(now);
      var max = Math.max.apply(null, d.intervals.map(function (x) { return Math.abs(x.price); })) || 1;
      var lo = d.intervals.reduce(function (a, b) { return b.price < a.price ? b : a; });
      var hi = d.intervals.reduce(function (a, b) { return b.price > a.price ? b : a; });
      box.innerHTML =
        '<div class="kpis">' +
          k("Just nu", cur ? nf.format(cur.price) + " kr" : "–") +
          k("Dygnsmedel", nf.format(d.average) + " kr") +
          k("Billigast / dyrast", nf.format(lo.price) + " / " + nf.format(hi.price) + " kr") +
        "</div>" +
        '<div class="chart" role="img" aria-label="Spotpris per intervall i dag, ' + area + '">' +
          d.intervals.map(function (x) {
            var h = Math.max(1, Math.abs(x.price) / max * 100);
            var cls = "bar" + (x === cur ? " now" : "") + (x.price < 0 ? " neg" : "");
            return '<div class="' + cls + '" style="height:' + h.toFixed(1) + '%" title="' + hm.format(x.start) + ": " +
              nf.format(x.price) + ' kr/kWh"></div>';
          }).join("") +
        "</div>" +
        '<div class="axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>' +
        '<p class="src">Källa: ' + d.source + " · " + d.intervals.length + " intervall · hämtat " +
          new Intl.DateTimeFormat("sv-SE", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(d.fetchedAt) +
          ". Priserna är spotpris exkl. moms, påslag, nätavgift och energiskatt.</p>";
    }).catch(function (e) {
      box.innerHTML = '<div class="verdict bad">Elpriserna kunde inte hämtas just nu (' + e.message + "). Försök igen om en stund.</div>";
    });
  }
  function k(l, v) { return '<div class="kpi"><div class="label">' + l + '</div><div class="value">' + v + "</div></div>"; }
  sel.addEventListener("change", show);
  show();
})();
