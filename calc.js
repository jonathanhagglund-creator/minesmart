/* MineSmart – beräkningar (samma formler som Python-versionen). Inga nätverksanrop här. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MSCalc = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var BLOCK_TARGET_S = 120;                // Moneros protokoll: ett block per 120 s
  var BLOCKS_PER_DAY = 86400 / BLOCK_TARGET_S;
  var TAIL_EMISSION_XMR = 0.6;             // Moneros protokoll sedan juni 2022
  var DAYS_PER_YEAR = 365.25;
  var DAYS_PER_MONTH = DAYS_PER_YEAR / 12;

  function ValidationError(msg) { this.name = "ValidationError"; this.message = msg; }
  ValidationError.prototype = Object.create(Error.prototype);

  function num(name, v, opt) {
    opt = opt || {};
    if (v === null || v === undefined || v === "" || typeof v === "boolean")
      throw new ValidationError(name + ": värde saknas");
    var x = typeof v === "number" ? v : Number(String(v).replace(",", ".").replace(/\s/g, ""));
    if (!isFinite(x)) throw new ValidationError(name + ": måste vara ett tal");
    var min = opt.min === undefined ? 0 : opt.min;
    if (opt.positive && x <= 0) throw new ValidationError(name + ": måste vara större än 0");
    if (min !== null && x < min) throw new ValidationError(name + ": får inte vara mindre än " + min);
    if (opt.max !== undefined && x > opt.max) throw new ValidationError(name + ": får inte vara större än " + opt.max);
    return x;
  }

  /** Elpris per kWh inkl. moms. Alla delar exkl. moms; spot får vara negativt. */
  function electricity(c) {
    var spot = num("Spotpris", c.spot, { min: null });
    var markup = num("Elhandelspåslag", c.markup || 0);
    var grid = num("Elnätsavgift", c.grid || 0);
    var tax = num("Energiskatt", c.tax || 0);
    var vat = num("Moms", c.vat === undefined ? 0.25 : c.vat, { max: 1 });
    var excl = spot + markup + grid + tax;
    return {
      spot: spot, markup: markup, grid: grid, tax: tax, vatRate: vat,
      vat: excl * vat, total: excl * (1 + vat),
      spotForTotal: function (total) { return total / (1 + vat) - markup - grid - tax; }
    };
  }

  function calculate(i) {
    var hashrate = num("Hashrate (H/s)", i.hashrate);
    var power = num("Effekt (W)", i.power, { max: 100000 });
    var idle = num("Viloeffekt (W)", i.idle || 0);
    var price = num("Elpris", i.electricityPrice, { min: null });
    var xmr = num("XMR-pris (SEK)", i.xmrPrice);
    var diff = num("Nätverkets difficulty", i.difficulty, { positive: true });
    var reward = num("Blockbelöning", i.blockReward === undefined ? TAIL_EMISSION_XMR : i.blockReward, { positive: true });
    var fee = num("Poolavgift", i.poolFee || 0, { max: 1 });
    var hw = num("Hårdvarukostnad", i.hardwareCost || 0);
    if (idle > power) throw new ValidationError("Viloeffekten kan inte vara högre än effekten under mining");

    var netHash = diff / BLOCK_TARGET_S;
    var xmrGross = hashrate / netHash * BLOCKS_PER_DAY * reward;
    var gross = xmrGross * xmr;
    var feeSek = gross * fee;
    var revenue = gross - feeSek;
    var kwh = (power - idle) * 24 / 1000;
    var cost = kwh * price;
    var net = revenue - cost;
    var payback = hw === 0 ? 0 : (net > 0 ? hw / net : null);
    var day = {
      xmr: xmrGross * (1 - fee), gross: gross, fee: feeSek, revenue: revenue,
      kwh: kwh, cost: cost, net: net
    };
    function scale(f) { var o = {}; for (var k in day) o[k] = day[k] * f; return o; }
    return {
      networkHashrate: netHash,
      day: day, month: scale(DAYS_PER_MONTH), year: scale(DAYS_PER_YEAR),
      breakEvenPrice: kwh > 0 ? revenue / kwh : null,
      paybackDays: payback,
      margin: revenue > 0 ? net / revenue : null,
      profitable: net > 0
    };
  }

  return {
    calculate: calculate, electricity: electricity, ValidationError: ValidationError,
    BLOCK_TARGET_S: BLOCK_TARGET_S, TAIL_EMISSION_XMR: TAIL_EMISSION_XMR,
    DAYS_PER_MONTH: DAYS_PER_MONTH, DAYS_PER_YEAR: DAYS_PER_YEAR
  };
});
