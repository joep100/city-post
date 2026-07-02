/* Molli fit-core — shared sizing + cage logic.
   One source of truth for the "will it fit?" tool and the booking Step 4.
   Pure functions + a self-contained SVG cage renderer. No DOM assumptions
   beyond the <svg> element you pass to drawGauge. */
(function (root) {
  var ACCENT = '#7FE001';

  // Flat base price per tier (Zone 1 / City Centre). Greater Dublin adds €2.
  var PRICES = { small: 7.99, package: 8.99, box: 9.99 };

  var TIER_NAME = { small: 'Small parcel', package: 'Parcel', box: 'Box' };

  // Carrier envelope depends on the route. Zone 1 (city centre) runs on
  // cargo bikes with a big box; Zone 2 (greater Dublin) is capped smaller.
  // The three pricing tiers exist on both routes — Zone 1 just carries a
  // larger max parcel across the board.
  var ENVELOPE = {
    zone1: { maxLong: 80, maxSide: 60, kg: 30, vcap: 288000, label: '80\u00d760\u00d760 cm, 30 kg', route: 'cargo bike' },
    zone2: { maxLong: 40, maxSide: 30, kg: 8, vcap: 36000,  label: '40\u00d730\u00d730 cm, 8 kg', route: 'bike' }
  };
  function normZone(z) { return z === 'zone2' ? 'zone2' : 'zone1'; }
  function envelope(zone) { return ENVELOPE[normZone(zone)]; }
  function maxLabel(zone) { return ENVELOPE[normZone(zone)].label; }

  function caps(zone) {
    var box = envelope(zone);
    return {
      small:   { maxLong: 35, maxSide: 25, kg: 1,  vcap: 15000 },
      package: { maxLong: 45, maxSide: 35, kg: 2,  vcap: 31500 },
      box:     { maxLong: box.maxLong, maxSide: box.maxSide, kg: box.kg, vcap: box.vcap }
    };
  }

  function fitsCap(l, w, h, kg, cap) {
    var d = [l, w, h].slice().sort(function (a, b) { return b - a; });
    if (d[0] > cap.maxLong) return false;
    if (d[1] > cap.maxSide || d[2] > cap.maxSide) return false;
    if (kg > cap.kg) return false;
    if (l * w * h > cap.vcap + 1) return false;
    return true;
  }

  // Classify an item. startTier is the tier the customer picked; an item too
  // big for it but fitting the next one up auto-upgrades (and is charged there).
  function classify(l, w, h, kg, startTier, zone) {
    var CAPS = caps(zone);
    var order = ['small', 'package', 'box'];
    var startIdx = Math.max(0, order.indexOf(startTier || 'small'));
    var effective = startTier || 'small', upgraded = false, fits = false;
    for (var ci = startIdx; ci < order.length; ci++) {
      if (fitsCap(l, w, h, kg, CAPS[order[ci]])) {
        fits = true; effective = order[ci]; upgraded = (ci > startIdx); break;
      }
    }
    var vol = l * w * h;
    var chargeableKg = Math.max(kg, vol / 5000); // volumetric convention ÷5000
    var reasons = [];
    if (!fits) {
      var cap = CAPS.box, d = [l, w, h].slice().sort(function (a, b) { return b - a; });
      if (d[0] > cap.maxLong) reasons.push('longest side over ' + cap.maxLong + ' cm');
      if (d[1] > cap.maxSide || d[2] > cap.maxSide) reasons.push('over ' + cap.maxSide + ' cm on a side');
      if (kg > cap.kg) reasons.push('over ' + cap.kg + ' kg');
      if (vol > cap.vcap + 1) reasons.push('too bulky');
    }
    return {
      fits: fits, effective: effective, upgraded: upgraded,
      chargeableKg: chargeableKg, reasons: reasons,
      caps: CAPS[effective]
    };
  }

  // Render the 3D cage into an <svg>. lim = tier caps drawn as the frame
  // {l,w,h}; parcel = the item {l,w,h}; fitsOverride false => red box.
  function drawGauge(svg, lim, parcel, fitsOverride) {
    if (!svg) return;
    var vb = (svg.getAttribute('viewBox') || '0 0 360 276').split(/\s+/).map(Number);
    var W = vb[2] || 360, H = vb[3] || 276, padX = 58, padTop = 36, padBot = 40, dco = 0.5;
    var mL = Math.max(lim.l, parcel ? parcel.l : 0);
    var mW = Math.max(lim.w, parcel ? parcel.w : 0);
    var mH = Math.max(lim.h, parcel ? parcel.h : 0);
    var scale = Math.min((W - 2 * padX) / (mW + mL * dco), (H - padTop - padBot) / (mH + mL * dco));
    function faces(fx, fy, wv, hv, lv, stroke, fillOn, dash, sw) {
      var bw = wv * scale, bh = hv * scale, ox = lv * scale * dco, oy = lv * scale * dco;
      var bx = fx + ox, by = fy - oy, d = dash ? ' stroke-dasharray="4 4"' : '';
      var g = '';
      g += '<polygon points="' + fx + ',' + fy + ' ' + (fx + bw) + ',' + fy + ' ' + (bx + bw) + ',' + by + ' ' + bx + ',' + by + '" fill="' + stroke + '" fill-opacity="' + (fillOn ? 0.12 : 0) + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + d + '/>';
      g += '<polygon points="' + (fx + bw) + ',' + fy + ' ' + (fx + bw) + ',' + (fy + bh) + ' ' + (bx + bw) + ',' + (by + bh) + ' ' + (bx + bw) + ',' + by + '" fill="' + stroke + '" fill-opacity="' + (fillOn ? 0.2 : 0) + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + d + '/>';
      g += '<rect x="' + fx + '" y="' + fy + '" width="' + bw + '" height="' + bh + '" fill="' + stroke + '" fill-opacity="' + (fillOn ? 0.26 : 0) + '" stroke="' + stroke + '" stroke-width="' + (sw + 0.5) + '"' + d + '/>';
      return g;
    }
    var maxOx = mL * scale * dco;
    var envWpx = mW * scale + maxOx, envHpx = mH * scale + maxOx;
    var fx = padX + ((W - 2 * padX) - envWpx) / 2;
    var top = padTop + ((H - padTop - padBot) - envHpx) / 2;
    var cw = lim.w * scale, ch = lim.h * scale, cox = lim.l * scale * dco;
    var ground = top + maxOx + mH * scale;
    var fy = ground - ch;
    var s = '';
    s += '<ellipse cx="' + (fx + cw / 2 + cox / 2) + '" cy="' + (ground + 11) + '" rx="' + (cw * 0.72) + '" ry="7" fill="#000" opacity="0.35"/>';
    s += '<polygon points="' + fx + ',' + ground + ' ' + (fx + cw) + ',' + ground + ' ' + (fx + cw + cox) + ',' + (ground - cox) + ' ' + (fx + cox) + ',' + (ground - cox) + '" fill="' + ACCENT + '" fill-opacity="0.08" stroke="' + ACCENT + '" stroke-opacity="0.45" stroke-width="1"/>';
    s += faces(fx, fy, lim.w, lim.h, lim.l, ACCENT, false, true, 1);
    var ox = cox, oy = cox, bw = cw, bh = ch;
    var verts = [[fx, fy], [fx + bw, fy], [fx, fy + bh], [fx + bw, fy + bh], [fx + ox, fy - oy], [fx + bw + ox, fy - oy], [fx + ox, fy + bh - oy], [fx + bw + ox, fy + bh - oy]];
    verts.forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.4" fill="' + ACCENT + '"/>'; });
    s += '<text x="' + (fx + bw / 2) + '" y="' + (fy + bh + 16) + '" fill="' + ACCENT + '" font-size="9" font-family="monospace" text-anchor="middle">' + lim.w + ' cm</text>';
    var hx = fx - 10, hy = fy + bh / 2;
    s += '<text x="' + hx + '" y="' + hy + '" fill="' + ACCENT + '" font-size="9" font-family="monospace" text-anchor="middle" transform="rotate(-90 ' + hx + ' ' + hy + ')">' + lim.h + ' cm</text>';
    s += '<text x="' + (fx + bw + ox / 2 + 11) + '" y="' + (fy - oy / 2 - 3) + '" fill="' + ACCENT + '" font-size="9" font-family="monospace" text-anchor="middle">' + lim.l + ' cm</text>';
    if (parcel) {
      var col = (fitsOverride === false) ? '#ff5a5a' : ACCENT;
      s += faces(fx, ground - parcel.h * scale, parcel.w, parcel.h, parcel.l, col, true, false, 1.75);
    }
    svg.innerHTML = s;
  }

  // Everyday-object presets — high-value / small first, then the bigger tiers.
  var PRESETS = [
    { id: 'perfume',   label: 'Perfume box',   l: 12, w: 8,  h: 15, kg: 0.4 },
    { id: 'jewellery', label: 'Jewellery box', l: 10, w: 8,  h: 5,  kg: 0.2 },
    { id: 'phone',     label: 'Phone / buds',  l: 17, w: 9,  h: 4,  kg: 0.3 },
    { id: 'meds',      label: 'Prescription',  l: 15, w: 10, h: 6,  kg: 0.3 },
    { id: 'book',      label: 'Hardback book', l: 24, w: 16, h: 4,  kg: 0.6 },
    { id: 'trainers',  label: 'Trainers',      l: 34, w: 22, h: 13, kg: 1.2 },
    { id: 'wine',      label: 'Bottle of wine',l: 35, w: 10, h: 10, kg: 1.5 },
    { id: 'winecase',  label: 'Wine case (6)', l: 35, w: 25, h: 30, kg: 8 },
    { id: 'hamper',    label: 'Gift hamper',   l: 40, w: 32, h: 26, kg: 6 }
  ];

  root.MolliFit = {
    ACCENT: ACCENT, PRICES: PRICES, TIER_NAME: TIER_NAME,
    caps: caps, classify: classify, drawGauge: drawGauge, PRESETS: PRESETS,
    ENVELOPE: ENVELOPE, envelope: envelope, maxLabel: maxLabel, normZone: normZone
  };
})(window);
