/* Pixeledit — animated GIF encoder (GIF89a, LZW, median-cut quantizer) */
'use strict';

const GifEncoder = (() => {
  class ByteWriter {
    constructor(size = 1 << 16) {
      this.buf = new Uint8Array(size);
      this.len = 0;
    }
    ensure(k) {
      if (this.len + k <= this.buf.length) return;
      let n = this.buf.length * 2;
      while (n < this.len + k) n *= 2;
      const b = new Uint8Array(n);
      b.set(this.buf.subarray(0, this.len));
      this.buf = b;
    }
    byte(v) {
      this.ensure(1);
      this.buf[this.len++] = v & 255;
    }
    u16(v) {
      this.byte(v & 255);
      this.byte((v >> 8) & 255);
    }
    bytes(arr) {
      this.ensure(arr.length);
      this.buf.set(arr, this.len);
      this.len += arr.length;
    }
    str(s) {
      for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
    }
    result() {
      return this.buf.slice(0, this.len);
    }
  }

  /** Writes an LZW-compressed image data stream in 255-byte sub-blocks. */
  function writeLzw(w, minCodeSize, indices) {
    w.byte(minCodeSize);
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let next = eoiCode + 1;
    let cur = 0, shift = 0;
    const block = new Uint8Array(255);
    let blen = 0;
    const flushBlock = () => {
      if (!blen) return;
      w.byte(blen);
      w.bytes(block.subarray(0, blen));
      blen = 0;
    };
    const outByte = (b) => {
      block[blen++] = b;
      if (blen === 255) flushBlock();
    };
    const emit = (code) => {
      cur |= code << shift;
      shift += codeSize;
      while (shift >= 8) {
        outByte(cur & 255);
        cur >>>= 8;
        shift -= 8;
      }
    };

    let dict = new Map();
    emit(clearCode);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (prefix << 8) | k;
      const code = dict.get(key);
      if (code !== undefined) {
        prefix = code;
        continue;
      }
      emit(prefix);
      if (next === 4096) {
        emit(clearCode);
        dict = new Map();
        next = eoiCode + 1;
        codeSize = minCodeSize + 1;
      } else {
        if (next >= 1 << codeSize) codeSize++;
        dict.set(key, next++);
      }
      prefix = k;
    }
    emit(prefix);
    emit(eoiCode);
    if (shift > 0) outByte(cur & 255);
    flushBlock();
    w.byte(0);
  }

  /** Median-cut color quantization. `counts` maps 0xBBGGRR → pixel count. */
  function medianCut(counts, target) {
    const all = [];
    for (const [rgb, n] of counts) all.push({ c: [rgb & 255, (rgb >> 8) & 255, (rgb >> 16) & 255], n });
    const boxes = [all];
    const range = (box) => {
      const lo = [255, 255, 255], hi = [0, 0, 0];
      for (const { c } of box) for (let k = 0; k < 3; k++) {
        if (c[k] < lo[k]) lo[k] = c[k];
        if (c[k] > hi[k]) hi[k] = c[k];
      }
      const d = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
      const ch = d[0] >= d[1] && d[0] >= d[2] ? 0 : d[1] >= d[2] ? 1 : 2;
      return { ch, size: d[ch] };
    };
    while (boxes.length < target) {
      let best = -1, bestScore = -1, bestCh = 0;
      boxes.forEach((box, i) => {
        if (box.length < 2) return;
        const { ch, size } = range(box);
        let pop = 0;
        for (const e of box) pop += e.n;
        const score = size * Math.sqrt(pop);
        if (score > bestScore) { bestScore = score; best = i; bestCh = ch; }
      });
      if (best < 0) break;
      const box = boxes[best];
      box.sort((a, b) => a.c[bestCh] - b.c[bestCh]);
      let total = 0;
      for (const e of box) total += e.n;
      let acc = 0, cut = 1;
      for (let i = 0; i < box.length - 1; i++) {
        acc += box[i].n;
        if (acc >= total / 2) { cut = i + 1; break; }
        cut = i + 1;
      }
      boxes.splice(best, 1, box.slice(0, cut), box.slice(cut));
    }
    return boxes.map((box) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (const e of box) { r += e.c[0] * e.n; g += e.c[1] * e.n; b += e.c[2] * e.n; n += e.n; }
      return (Math.round(r / n) | (Math.round(g / n) << 8) | (Math.round(b / n) << 16)) >>> 0;
    });
  }

  function buildPalette(frames, transparent) {
    const counts = new Map();
    for (const f of frames) {
      for (let i = 0; i < f.length; i++) {
        const c = f[i];
        if (transparent && (c >>> 24) < 128) continue;
        const rgb = c & 0xffffff;
        counts.set(rgb, (counts.get(rgb) || 0) + 1);
      }
    }
    const offset = transparent ? 1 : 0;
    const max = 256 - offset;
    const exact = counts.size <= max;
    const colors = exact ? [...counts.keys()] : medianCut(counts, max);
    if (!colors.length) colors.push(0);
    const table = transparent ? [0, ...colors] : colors;
    const lookup = new Map();
    colors.forEach((rgb, i) => lookup.set(rgb, i + offset));
    const nearest = (rgb) => {
      const r = rgb & 255, g = (rgb >> 8) & 255, b = (rgb >> 16) & 255;
      let best = offset, bd = Infinity;
      for (let i = 0; i < colors.length; i++) {
        const p = colors[i];
        const dr = (p & 255) - r, dg = ((p >> 8) & 255) - g, db = ((p >> 16) & 255) - b;
        const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
        if (d < bd) { bd = d; best = i + offset; }
      }
      lookup.set(rgb, best);
      return best;
    };
    const index = (c) => {
      if (transparent && (c >>> 24) < 128) return 0;
      const rgb = c & 0xffffff;
      const hit = lookup.get(rgb);
      return hit !== undefined ? hit : nearest(rgb);
    };
    return { table, index };
  }

  /**
   * frames: [{ data: Uint32Array(width*height) packed RGBA, delay: ms }]
   * Returns a Uint8Array containing the GIF file.
   */
  function encode({ width, height, frames, loop = true, transparent = true }) {
    const pal = buildPalette(frames.map((f) => f.data), transparent);
    let bits = 2;
    while (1 << bits < pal.table.length) bits++;
    const size = 1 << bits;

    const w = new ByteWriter(Math.max(1 << 16, width * height));
    w.str('GIF89a');
    w.u16(width);
    w.u16(height);
    w.byte(0x80 | ((bits - 1) << 4) | (bits - 1));
    w.byte(0);
    w.byte(0);
    for (let i = 0; i < size; i++) {
      const rgb = pal.table[i] || 0;
      w.byte(rgb & 255);
      w.byte((rgb >> 8) & 255);
      w.byte((rgb >> 16) & 255);
    }
    if (loop && frames.length > 1) {
      w.byte(0x21); w.byte(0xff); w.byte(11);
      w.str('NETSCAPE2.0');
      w.byte(3); w.byte(1); w.u16(0); w.byte(0);
    }
    const indices = new Uint8Array(width * height);
    for (const f of frames) {
      w.byte(0x21); w.byte(0xf9); w.byte(4);
      w.byte(transparent ? (2 << 2) | 1 : 1 << 2);
      w.u16(Math.max(2, Math.round((f.delay || 100) / 10)));
      w.byte(0);
      w.byte(0);

      w.byte(0x2c);
      w.u16(0); w.u16(0);
      w.u16(width); w.u16(height);
      w.byte(0);
      for (let i = 0; i < indices.length; i++) indices[i] = pal.index(f.data[i]);
      writeLzw(w, bits, indices);
    }
    w.byte(0x3b);
    return w.result();
  }

  return { encode };
})();
