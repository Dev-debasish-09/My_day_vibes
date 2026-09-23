/* =====================================================================
   Little Sunshine: art.js
   Generates a small abstract SVG artwork from a seed and the sky colors.
   Same seed + same colors + same style = exactly the same picture.

   Public API (on window.LittleSunshineArt):
     generateArt(seed, skyColors, options) -> SVG string
       skyColors: { skyTop, skyBottom, hillBack, hillFront, sunCore, sunEdge, accent }
       options:   { style: 0-4, width, height }  (all optional)
     STYLE_NAMES -> ["Blob garden", ...]

   The artwork is 4:5 portrait (viewBox 0 0 400 500). When a width/height
   with a different shape is given (e.g. 1080x1920 for a wallpaper), it
   is scaled to cover and centered.
   ===================================================================== */
(function () {
  'use strict';

  const W = 400;
  const H = 500;
  const WHITE = '#FFFFFF';


  /* -------------------------------------------------------------------
     Seeded randomness
     ------------------------------------------------------------------- */

  // mulberry32: tiny, fast, and always gives the same numbers for a seed
  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t = (t + 0x6D2B79F5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Friendlier helpers on top of the generator
  function makeRandom(seed) {
    const next = mulberry32(seed);
    return {
      next: next,
      range: (min, max) => min + (max - min) * next(),
      int: (min, max) => Math.floor(min + (max - min + 1) * next()),
      pick: (list) => list[Math.floor(next() * list.length)],
    };
  }


  /* -------------------------------------------------------------------
     Small SVG helpers
     ------------------------------------------------------------------- */

  // Round numbers so the SVG stays short
  function n(value) {
    return Math.round(value * 10) / 10;
  }

  // A vertical linear gradient. stops: [[offset 0-1, color, opacity?], ...]
  function verticalGradient(id, stops) {
    const stopTags = stops.map(([offset, color, opacity]) =>
      '<stop offset="' + offset + '" stop-color="' + color + '"' +
      (opacity === undefined ? '' : ' stop-opacity="' + opacity + '"') + '/>'
    ).join('');
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' + stopTags + '</linearGradient>';
  }

  function blurFilter(id, amount) {
    return '<filter id="' + id + '" x="-50%" y="-50%" width="200%" height="200%">' +
      '<feGaussianBlur stdDeviation="' + amount + '"/></filter>';
  }

  function background(fill) {
    return '<rect width="' + W + '" height="' + H + '" fill="' + fill + '"/>';
  }

  // Smooth closed shape through the given points (Catmull-Rom to Bezier)
  function smoothClosedPath(points) {
    const count = points.length;
    let d = 'M' + n(points[0][0]) + ' ' + n(points[0][1]);
    for (let i = 0; i < count; i++) {
      const p0 = points[(i - 1 + count) % count];
      const p1 = points[i];
      const p2 = points[(i + 1) % count];
      const p3 = points[(i + 2) % count];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += 'C' + n(c1x) + ' ' + n(c1y) + ' ' + n(c2x) + ' ' + n(c2y) + ' ' + n(p2[0]) + ' ' + n(p2[1]);
    }
    return d + 'Z';
  }

  // Organic blob: points around a center with wobbly distances
  function blobPath(rng, cx, cy, radius) {
    const count = rng.int(6, 8);
    const points = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = radius * rng.range(0.72, 1.15);
      points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
    }
    return smoothClosedPath(points);
  }

  // A soft wave from left to right, filled down to the bottom edge
  function wavePath(rng, baseY, amplitude) {
    const f1 = rng.range(0.008, 0.018);
    const f2 = rng.range(0.02, 0.035);
    const p1 = rng.range(0, Math.PI * 2);
    const p2 = rng.range(0, Math.PI * 2);
    const a2 = amplitude * rng.range(0.2, 0.45);
    const yAt = (x) => baseY + Math.sin(x * f1 + p1) * amplitude + Math.sin(x * f2 + p2) * a2;

    let d = 'M-10 ' + n(yAt(-10));
    for (let x = 10; x <= W + 10; x += 20) {
      d += 'L' + x + ' ' + n(yAt(x));
    }
    return d + 'L' + (W + 10) + ' ' + (H + 10) + 'L-10 ' + (H + 10) + 'Z';
  }


  /* -------------------------------------------------------------------
     Style 1: Blob garden (soft overlapping organic blobs)
     ------------------------------------------------------------------- */
  function drawBlobGarden(rng, c, id) {
    const palette = [c.hillBack, c.hillFront, c.sunEdge, c.sunCore, c.accent, WHITE];
    const blobs = [];
    const count = rng.int(8, 11);

    for (let i = 0; i < count; i++) {
      const color = rng.pick(palette);
      const maxOpacity = color === c.accent ? 0.5 : 0.85; // keep the accent gentle
      blobs.push({
        cx: rng.range(-20, W + 20),
        cy: rng.range(30, H + 20),
        r: rng.range(50, 135),
        color: color,
        opacity: rng.range(0.5, maxOpacity),
      });
    }
    blobs.sort((a, b) => b.r - a.r); // big ones behind, small ones in front

    const shapes = blobs.map((b) =>
      '<path d="' + blobPath(rng, b.cx, b.cy, b.r) + '" fill="' + b.color + '" fill-opacity="' + n(b.opacity) + '"/>'
    ).join('');

    return {
      defs: verticalGradient(id + 'bg', [[0, c.skyTop], [1, c.skyBottom]]),
      body: background('url(#' + id + 'bg)') + shapes,
    };
  }


  /* -------------------------------------------------------------------
     Style 2: Watercolor moons (blurred, layered, see-through circles)
     ------------------------------------------------------------------- */
  function drawWatercolorMoons(rng, c, id) {
    const palette = [c.hillBack, c.hillFront, c.sunEdge, c.sunCore, c.accent, WHITE];

    let washes = '';
    const washCount = rng.int(9, 13);
    for (let i = 0; i < washCount; i++) {
      washes += '<circle cx="' + n(rng.range(0, W)) + '" cy="' + n(rng.range(0, H)) +
        '" r="' + n(rng.range(40, 140)) + '" fill="' + rng.pick(palette) +
        '" fill-opacity="' + n(rng.range(0.28, 0.55)) + '"/>';
    }

    // A few clearer "moons" on top, each with a soft halo
    let moons = '';
    const moonCount = rng.int(3, 5);
    for (let i = 0; i < moonCount; i++) {
      const cx = rng.range(50, W - 50);
      const cy = rng.range(50, H - 50);
      const r = rng.range(14, 42);
      const color = rng.pick([c.sunCore, WHITE, c.sunEdge]);
      moons += '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r * 1.7) + '" fill="' + color +
        '" fill-opacity="0.35" filter="url(#' + id + 'soft)"/>';
      moons += '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '" fill="' + color + '" fill-opacity="0.9"/>';
    }

    return {
      defs: verticalGradient(id + 'bg', [[0, c.skyTop], [1, c.skyBottom]]) +
        blurFilter(id + 'blur', 14) + blurFilter(id + 'soft', 8),
      body: background('url(#' + id + 'bg)') +
        '<g filter="url(#' + id + 'blur)">' + washes + '</g>' + moons,
    };
  }


  /* -------------------------------------------------------------------
     Style 3: Flower field (simple 5-petal flowers on a gradient)
     ------------------------------------------------------------------- */
  function drawFlower(rng, c, x, y, size) {
    const petalColor = rng.pick([WHITE, c.sunCore, c.accent, c.hillFront, c.hillBack]);
    const turn = rng.range(0, 72);
    const stemLength = rng.range(size * 1.5, size * 3);

    let flower = '<path d="M' + n(x) + ' ' + n(y) + 'q' + n(rng.range(-6, 6)) + ' ' + n(stemLength / 2) +
      ' 0 ' + n(stemLength) + '" stroke="' + c.hillFront + '" stroke-width="2.4" stroke-linecap="round" fill="none"/>';

    flower += '<g transform="translate(' + n(x) + ' ' + n(y) + ') rotate(' + n(turn) + ')">';
    for (let i = 0; i < 5; i++) {
      flower += '<ellipse cx="0" cy="' + n(-size * 0.62) + '" rx="' + n(size * 0.42) + '" ry="' + n(size * 0.62) +
        '" fill="' + petalColor + '" fill-opacity="0.92" transform="rotate(' + i * 72 + ')"/>';
    }
    flower += '<circle r="' + n(size * 0.3) + '" fill="' + c.sunEdge + '"/></g>';
    return flower;
  }

  function drawFlowerField(rng, c, id) {
    const flowers = [];
    const count = rng.int(15, 22);
    for (let i = 0; i < count; i++) {
      flowers.push({ x: rng.range(24, W - 24), y: rng.range(70, H - 30), size: rng.range(10, 24) });
    }
    flowers.sort((a, b) => a.y - b.y); // lower flowers overlap the ones behind them

    return {
      defs: verticalGradient(id + 'bg', [[0, c.skyTop], [0.55, c.skyBottom], [1, c.hillBack]]),
      body: background('url(#' + id + 'bg)') +
        flowers.map((f) => drawFlower(rng, c, f.x, f.y, f.size)).join(''),
    };
  }


  /* -------------------------------------------------------------------
     Style 4: Gentle waves (4-6 stacked wavy layers, with a sun)
     ------------------------------------------------------------------- */
  function drawGentleWaves(rng, c, id) {
    // Lightest (back) to darkest (front)
    const layerColors = [
      [WHITE, 0.5], [c.sunEdge, 0.55], [c.hillBack, 1],
      [c.hillFront, 1], [c.accent, 0.55], [c.accent, 0.85],
    ];
    const count = rng.int(4, 6);
    const colors = layerColors.slice(layerColors.length - count);

    const sunX = rng.range(90, W - 90);
    const sunY = rng.range(110, 190);
    const sunR = rng.range(38, 56);
    const sun =
      '<circle cx="' + n(sunX) + '" cy="' + n(sunY) + '" r="' + n(sunR * 1.9) + '" fill="' + c.sunEdge + '" fill-opacity="0.28"/>' +
      '<circle cx="' + n(sunX) + '" cy="' + n(sunY) + '" r="' + n(sunR) + '" fill="url(#' + id + 'sun)"/>';

    let waves = '';
    const top = rng.range(220, 260);
    const step = (H - 40 - top) / (count - 1);
    colors.forEach(([color, opacity], i) => {
      waves += '<path d="' + wavePath(rng, top + i * step, rng.range(10, 22)) + '" fill="' + color +
        '" fill-opacity="' + opacity + '"/>';
    });

    return {
      defs: verticalGradient(id + 'bg', [[0, c.skyTop], [1, c.skyBottom]]) +
        '<radialGradient id="' + id + 'sun"><stop offset="0.45" stop-color="' + c.sunCore + '"/>' +
        '<stop offset="1" stop-color="' + c.sunEdge + '"/></radialGradient>',
      body: background('url(#' + id + 'bg)') + sun + waves,
    };
  }


  /* -------------------------------------------------------------------
     Style 5: Starry sky (deep gradient, glowing dots, crescent moon)
     ------------------------------------------------------------------- */
  function drawStarrySky(rng, c, id) {
    // Stars: small crisp dots, and a few bigger ones with a glow
    let stars = '';
    const count = rng.int(50, 80);
    for (let i = 0; i < count; i++) {
      const x = rng.range(0, W);
      const y = rng.range(0, H * 0.78);
      const r = rng.range(0.6, 2.3);
      const color = rng.next() < 0.75 ? WHITE : c.sunCore;
      if (r > 1.7) {
        stars += '<circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + n(r * 3) + '" fill="' + color +
          '" fill-opacity="0.5" filter="url(#' + id + 'glow)"/>';
      }
      stars += '<circle cx="' + n(x) + '" cy="' + n(y) + '" r="' + n(r) + '" fill="' + color +
        '" fill-opacity="' + n(rng.range(0.55, 1)) + '"/>';
    }

    // Crescent: a full moon with an offset circle cut out by a mask
    const mx = rng.range(90, W - 90);
    const my = rng.range(80, 170);
    const mr = rng.range(34, 46);
    const cutX = mx + mr * rng.range(0.38, 0.5);
    const cutY = my - mr * rng.range(0.1, 0.25);
    const moon =
      '<circle cx="' + n(mx) + '" cy="' + n(my) + '" r="' + n(mr * 1.9) + '" fill="' + c.sunEdge +
        '" fill-opacity="0.3" filter="url(#' + id + 'halo)"/>' +
      '<circle cx="' + n(mx) + '" cy="' + n(my) + '" r="' + n(mr) + '" fill="' + c.sunCore + '" mask="url(#' + id + 'moon)"/>';

    return {
      defs:
        verticalGradient(id + 'bg', [[0, c.accent], [0.55, c.accent], [1, c.hillFront]]) +
        blurFilter(id + 'glow', 2.2) + blurFilter(id + 'halo', 12) +
        '<mask id="' + id + 'moon"><rect width="' + W + '" height="' + H + '" fill="#fff"/>' +
        '<circle cx="' + n(cutX) + '" cy="' + n(cutY) + '" r="' + n(mr * 0.92) + '" fill="#000"/></mask>',
      body: background('url(#' + id + 'bg)') + stars + moon +
        '<path d="' + wavePath(rng, H - 55, 14) + '" fill="' + c.hillFront + '" fill-opacity="0.7"/>',
    };
  }


  /* -------------------------------------------------------------------
     Put it together
     ------------------------------------------------------------------- */
  const STYLES = [
    { name: 'Blob garden', draw: drawBlobGarden },
    { name: 'Watercolor moons', draw: drawWatercolorMoons },
    { name: 'Flower field', draw: drawFlowerField },
    { name: 'Gentle waves', draw: drawGentleWaves },
    { name: 'Starry sky', draw: drawStarrySky },
  ];

  function generateArt(seed, skyColors, options) {
    const opts = options || {};
    const cleanSeed = Math.abs(Math.floor(seed)) >>> 0;
    const styleIndex = Number.isInteger(opts.style) ? opts.style % STYLES.length : cleanSeed % STYLES.length;
    const rng = makeRandom(cleanSeed);

    // Unique id prefix, so gradients/filters never clash with another SVG on the page
    const id = 'ls' + cleanSeed.toString(36) + '-';
    const art = STYLES[styleIndex].draw(rng, skyColors, id);

    const size = opts.width && opts.height
      ? ' width="' + opts.width + '" height="' + opts.height + '"'
      : '';

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '"' + size +
      ' preserveAspectRatio="xMidYMid slice">' +
      '<defs>' + art.defs + '</defs>' + art.body + '</svg>';
  }

  window.LittleSunshineArt = {
    generateArt: generateArt,
    STYLE_NAMES: STYLES.map((s) => s.name),
  };
})();
