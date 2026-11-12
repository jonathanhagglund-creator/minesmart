/* Kopiera-knapp för donationsadressen. */
(function () {
  "use strict";
  var btn = document.getElementById("copy-xmr"), code = document.getElementById("xmr-addr"), ok = document.getElementById("copy-ok");
  if (!btn || !code) return;
  btn.addEventListener("click", function () {
    var text = code.textContent.trim();
    var done = function () { ok.hidden = false; setTimeout(function () { ok.hidden = true; }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, select);
    } else select();
    function select() {
      var r = document.createRange(); r.selectNodeContents(code);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      try { if (document.execCommand("copy")) done(); } catch (e) { /* markerad – användaren kan kopiera själv */ }
    }
  });
})();
