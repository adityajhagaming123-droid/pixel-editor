/* Pixeledit — shared utilities (colors, geometry, encoding, DOM helpers) */
'use strict';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function debounce(fn, ms) {
  let t = 0;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = () => {
    clearTimeout(t);
    fn();
  };
  return wrapped;
}

/* ---------------------------------------------------------------------------
 * Colors are stored as packed 32-bit integers whose little-endian byte order
 * is R, G, B, A — the same layout as ImageData, so a Uint32Array can be viewed
 * directly as canvas pixels. Fully transparent colors are always normalized
 * to 0 so that "transparent" compares equal everywhere.
 * ------------------------------------------------------------------------- */
const Color = {
  pack(r, g, b, a = 255) {
    if (a <= 0) return 0;
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  },
  unpack(c) {
    return { r: c & 255, g: (c >>> 8) & 255, b: (c >>> 16) & 255, a: c >>> 24 };
  },
  alpha: (c) => c >>> 24,
  toHex(c, withAlpha = true) {
    const h = (n) => n.toString(16).padStart(2, '0');
    const { r, g, b, a } = Color.unpack(c);
    return '#' + h(r) + h(g) + h(b) + (withAlpha && a !== 255 ? h(a) : '');
  },
  fromHex(str) {
    let s = String(str).trim().replace(/^#/, '');
    if (/^[0-9a-f]{3,4}$/i.test(s)) s = s.split('').map((ch) => ch + ch).join('');
    if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return null;
    const n = (i) => parseInt(s.substr(i, 2), 16);
    return Color.pack(n(0), n(2), n(4), s.length === 8 ? n(6) : 255);
  },
  toCss(c) {
    const { r, g, b, a } = Color.unpack(c);
    return a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
  },
  same(c1, c2) {
    return c1 === c2 || ((c1 >>> 24) === 0 && (c2 >>> 24) === 0);
  },
  /** Largest per-channel difference (0–255). */
  dist(c1, c2) {
    if ((c1 >>> 24) === 0 && (c2 >>> 24) === 0) return 0;
    const d = (s) => Math.abs(((c1 >>> s) & 255) - ((c2 >>> s) & 255));
    return Math.max(d(0), d(8), d(16), d(24));
  },
  rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max ? d / max : 0, v: max };
  },
  hsvToRgb(h, s, v) {
    const f = (n) => {
      const k = (n + h / 60) % 6;
      return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return { r: Math.round(f(5) * 255), g: Math.round(f(3) * 255), b: Math.round(f(1) * 255) };
  },
  rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return { h, s: Math.min(1, s), l };
  },
  hslToRgb(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
  },
  luma(c) {
    const { r, g, b } = Color.unpack(c);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  },
};

/** 4×4 ordered-dither (Bayer) threshold matrix, values 0–15. */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/* ---------------------------------------------------------------------------
 * Raster geometry
 * ------------------------------------------------------------------------- */
const Geo = {
  /** Bresenham line; calls cb(x, y) for every pixel from (x0,y0) to (x1,y1). */
  line(x0, y0, x1, y1, cb) {
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      cb(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  },

  /** Pixel-perfect ellipse inscribed in a rectangle (A. Zingl's algorithm). */
  ellipse(x0, y0, x1, y1) {
    const pts = [];
    let a = Math.abs(x1 - x0), b = Math.abs(y1 - y0), b1 = b & 1;
    let dx = 4 * (1 - a) * b * b, dy = 4 * (b1 + 1) * a * a;
    let err = dx + dy + b1 * a * a, e2;
    if (x0 > x1) { x0 = x1; x1 += a; }
    if (y0 > y1) y0 = y1;
    y0 += Math.floor((b + 1) / 2);
    y1 = y0 - b1;
    a = 8 * a * a;
    b1 = 8 * b * b;
    do {
      pts.push([x1, y0], [x0, y0], [x0, y1], [x1, y1]);
      e2 = 2 * err;
      if (e2 <= dy) { y0++; y1--; err += dy += a; }
      if (e2 >= dx || 2 * err > dy) { x0++; x1--; err += dx += b1; }
    } while (x0 <= x1);
    while (y0 - y1 <= b) {
      pts.push([x0 - 1, y0], [x1 + 1, y0++], [x0 - 1, y1], [x1 + 1, y1--]);
    }
    return pts;
  },

  /**
   * Region of pixels matching the color at (sx, sy).
   * Returns a Uint8Array mask. `limit` optionally restricts the region.
   */
  floodRegion(buf, W, H, sx, sy, tol, contiguous, limit) {
    const n = W * H, out = new Uint8Array(n);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H) return out;
    const start = sy * W + sx;
    if (limit && !limit[start]) return out;
    const target = buf[start];
    const match = tol <= 0 ? (c) => Color.same(c, target) : (c) => Color.dist(c, target) <= tol;
    if (!contiguous) {
      for (let i = 0; i < n; i++) if ((!limit || limit[i]) && match(buf[i])) out[i] = 1;
      return out;
    }
    const stack = new Int32Array(n);
    let sp = 0;
    stack[sp++] = start;
    out[start] = 1;
    const visit = (j) => {
      if (!out[j] && (!limit || limit[j]) && match(buf[j])) {
        out[j] = 1;
        stack[sp++] = j;
      }
    };
    while (sp) {
      const i = stack[--sp];
      const x = i % W;
      if (x > 0) visit(i - 1);
      if (x < W - 1) visit(i + 1);
      if (i >= W) visit(i - W);
      if (i < n - W) visit(i + W);
    }
    return out;
  },

  /** Rasterize a polygon (doc-space float points) into a mask (pixel centers inside). */
  polygonMask(pts, W, H) {
    const mask = new Uint8Array(W * H);
    const n = pts.length;
    if (n < 3) return mask;
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));
    const xs = [];
    for (let y = y0; y <= y1; y++) {
      const cy = y + 0.5;
      xs.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > cy) !== (yj > cy)) xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
        const xb = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = xa; x <= xb; x++) mask[y * W + x] = 1;
      }
    }
    return mask;
  },

  maskBounds(mask, W, H) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        if (mask[row + x]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  },

  shiftMask(mask, W, H, dx, dy) {
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const ty = y + dy;
      if (ty < 0 || ty >= H) continue;
      for (let x = 0; x < W; x++) {
        if (!mask[y * W + x]) continue;
        const tx = x + dx;
        if (tx >= 0 && tx < W) out[ty * W + tx] = 1;
      }
    }
    return out;
  },

  /**
   * Outline of a mask as line segments on pixel boundaries: a flat array of
   * x1,y1,x2,y2 quads. Collinear neighbouring edges are merged.
   */
  maskSegments(mask, W, H, bx = 0, by = 0, bw = W, bh = H) {
    const segs = [];
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
    for (let y = by; y <= by + bh; y++) {
      let start = -1;
      for (let x = bx; x <= bx + bw; x++) {
        const edge = x < bx + bw && inside(x, y) !== inside(x, y - 1);
        if (edge && start < 0) start = x;
        else if (!edge && start >= 0) { segs.push(start, y, x, y); start = -1; }
      }
    }
    for (let x = bx; x <= bx + bw; x++) {
      let start = -1;
      for (let y = by; y <= by + bh; y++) {
        const edge = y < by + bh && inside(x, y) !== inside(x - 1, y);
        if (edge && start < 0) start = y;
        else if (!edge && start >= 0) { segs.push(x, start, x, y); start = -1; }
      }
    }
    return segs;
  },

  /** Flip / rotate a w×h block of pixels (and an optional mask). */
  transformBlock(data, mask, w, h, kind) {
    const rot = kind === 'rotCW' || kind === 'rotCCW';
    const nw = rot ? h : w, nh = rot ? w : h;
    const out = new Uint32Array(nw * nh);
    const omask = mask ? new Uint8Array(nw * nh) : null;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let tx, ty;
        switch (kind) {
          case 'flipH': tx = w - 1 - x; ty = y; break;
          case 'flipV': tx = x; ty = h - 1 - y; break;
          case 'rot180': tx = w - 1 - x; ty = h - 1 - y; break;
          case 'rotCW': tx = h - 1 - y; ty = x; break;
          case 'rotCCW': tx = y; ty = w - 1 - x; break;
          default: tx = x; ty = y;
        }
        const j = ty * nw + tx, i = y * w + x;
        out[j] = data[i];
        if (omask) omask[j] = mask[i];
      }
    }
    return { data: out, mask: omask, w: nw, h: nh };
  },
};

/* ---------------------------------------------------------------------------
 * Binary encoding for project files (run-length + base64)
 * ------------------------------------------------------------------------- */
const Codec = {
  u8ToB64(u8) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  },
  b64ToU8(b64) {
    const s = atob(b64);
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return u8;
  },
  encodePixels(u32) {
    const runs = [];
    for (let i = 0; i < u32.length; ) {
      const v = u32[i];
      let j = i + 1;
      while (j < u32.length && u32[j] === v) j++;
      runs.push(j - i, v);
      i = j;
    }
    return Codec.u8ToB64(new Uint8Array(new Uint32Array(runs).buffer));
  },
  decodePixels(b64, n) {
    const u8 = Codec.b64ToU8(b64);
    const runs = new Uint32Array(u8.buffer, 0, u8.length >> 2);
    const out = new Uint32Array(n);
    let p = 0;
    for (let k = 0; k + 1 < runs.length && p < n; k += 2) {
      const len = Math.min(runs[k], n - p);
      out.fill(runs[k + 1], p, p + len);
      p += len;
    }
    return out;
  },
};

/* ---------------------------------------------------------------------------
 * DOM helpers
 * ------------------------------------------------------------------------- */
function el(tag, props, ...kids) {
  const node = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) node.style.setProperty(sk, sv);
          else node.style[sk] = sv;
        }
      } else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k in node && !k.includes('-') && !(typeof node[k] === 'boolean' && typeof v === 'string')) node[k] = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function safeFileName(name, fallback = 'sprite') {
  const s = String(name || '').trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
  return s || fallback;
}
