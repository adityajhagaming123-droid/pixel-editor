/* Pixeledit — pixel art & animation editor */
'use strict';

(() => {
  // ===========================================================================
  // Constants
  // ===========================================================================
  const MAX_SIZE = 1024;
  const MAX_HISTORY = 120;
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 128;
  const ZOOM_LEVELS = [0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96, 112, 128];
  const IS_MAC = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
  const KEYS = {
    autosave: 'pixeledit.autosave.v2',
    settings: 'pixeledit.settings.v2',
    palette: 'pixeledit.palette.v2',
    recent: 'pixeledit.recent.v2',
  };
  const BLEND_MODES = [
    ['normal', 'Normal', 'source-over'],
    ['multiply', 'Multiply', 'multiply'],
    ['screen', 'Screen', 'screen'],
    ['overlay', 'Overlay', 'overlay'],
    ['darken', 'Darken', 'darken'],
    ['lighten', 'Lighten', 'lighten'],
    ['color-dodge', 'Color Dodge', 'color-dodge'],
    ['color-burn', 'Color Burn', 'color-burn'],
    ['hard-light', 'Hard Light', 'hard-light'],
    ['soft-light', 'Soft Light', 'soft-light'],
    ['difference', 'Difference', 'difference'],
    ['exclusion', 'Exclusion', 'exclusion'],
    ['hue', 'Hue', 'hue'],
    ['saturation', 'Saturation', 'saturation'],
    ['color', 'Color', 'color'],
    ['luminosity', 'Luminosity', 'luminosity'],
    ['add', 'Add', 'lighter'],
  ];
  const BLEND_OP = Object.fromEntries(BLEND_MODES.map(([k, , op]) => [k, op]));
  const BLEND_LABEL = Object.fromEntries(BLEND_MODES.map(([k, l]) => [k, l]));
  const SCOPE_OPTIONS = [
    ['cel', 'Current layer · current frame'],
    ['layer', 'Current layer · all frames'],
    ['frame', 'All layers · current frame'],
    ['all', 'All layers · all frames'],
  ];

  const DEFAULT_SETTINGS = {
    tool: 'pencil',
    brushSize: 1,
    brushShape: 'square',
    pixelPerfect: false,
    symX: false,
    symY: false,
    fillContiguous: true,
    fillTolerance: 0,
    wandContiguous: true,
    wandTolerance: 0,
    shapeFilled: false,
    ditherDensity: 0.5,
    shadeMode: 'light',
    shadeAmount: 8,
    gradientMode: 'dither',
    sampleMode: 'composite',
    selMode: 'replace',
    grid: true,
    gridMinZoom: 6,
    tileGrid: 0,
    tileMode: false,
    checker: 'dark',
    onion: false,
    onionPrev: 1,
    onionNext: 1,
    onionOpacity: 40,
    onionTint: true,
    onionLayerOnly: true,
    onionFront: true,
    loopMode: 'loop',
    panelsHidden: false,
    timelineHidden: false,
    collapsed: {},
    previewScale: 0,
    exportScale: 4,
  };

  function readJSON(key, fallback = null) {
    try {
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : fallback;
    } catch (_) {
      return fallback;
    }
  }
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  const settings = Object.assign({}, DEFAULT_SETTINGS, readJSON(KEYS.settings, {}));
  settings.collapsed = Object.assign({}, settings.collapsed);
  const persistSettings = debounce(() => writeJSON(KEYS.settings, settings), 250);

  // ===========================================================================
  // Tools
  // ===========================================================================
  const TOOLS = {
    pencil: { name: 'Pencil', key: 'B', icon: 'pencil', options: ['size', 'shape', 'pixelPerfect', 'symmetry'], hint: 'Left: primary · Right: secondary · Shift+click: line from last point · Alt: pick color' },
    eraser: { name: 'Eraser', key: 'E', icon: 'eraser', options: ['size', 'shape', 'symmetry'], hint: 'Erase to transparency · Shift+click: straight line' },
    bucket: { name: 'Fill', key: 'G', icon: 'bucket', options: ['fillContiguous', 'fillTolerance', 'symmetry'], hint: 'Fill an area · Right click fills with the secondary color' },
    gradient: { name: 'Gradient', key: 'Shift+G', icon: 'gradient', options: ['gradientMode'], hint: 'Drag to fill the selection (or layer) with a primary → secondary gradient' },
    eyedropper: { name: 'Eyedropper', key: 'I', icon: 'pipette', options: ['sampleMode'], hint: 'Left: pick primary · Right: pick secondary · Hold Alt with any brush' },
    line: { name: 'Line', key: 'L', icon: 'line', options: ['size', 'shape', 'symmetry'], hint: 'Drag to draw a line · Shift snaps to pixel-art angles' },
    rect: { name: 'Rectangle', key: 'R', icon: 'rect', options: ['size', 'shapeFilled', 'symmetry'], hint: 'Shift: square · Ctrl: draw from center' },
    ellipse: { name: 'Ellipse', key: 'O', icon: 'ellipse', options: ['size', 'shapeFilled', 'symmetry'], hint: 'Shift: circle · Ctrl: draw from center' },
    dither: { name: 'Dither Brush', key: 'D', icon: 'dither', options: ['size', 'shape', 'ditherDensity', 'symmetry'], hint: 'Paints an ordered dither pattern · Right click uses the secondary color' },
    shade: { name: 'Shade', key: 'S', icon: 'shade', options: ['size', 'shape', 'shadeMode', 'shadeAmount', 'symmetry'], hint: 'Left: lighten · Right: darken (each pixel once per stroke)' },
    select: { name: 'Rectangle Select', key: 'M', icon: 'select', options: ['selMode', 'selActions'], hint: 'Shift: add · Alt: subtract · Shift+Alt: intersect · Click to deselect' },
    lasso: { name: 'Lasso Select', key: 'Q', icon: 'lasso', options: ['selMode', 'selActions'], hint: 'Draw a freehand selection · Shift: add · Alt: subtract' },
    wand: { name: 'Magic Wand', key: 'W', icon: 'wand', options: ['selMode', 'wandContiguous', 'wandTolerance', 'selActions'], hint: 'Select similar colors · Shift: add · Alt: subtract' },
    move: { name: 'Move', key: 'V', icon: 'move', options: ['moveHint'], hint: 'Drag to move the selection or the whole layer · Arrow keys nudge' },
    hand: { name: 'Hand', key: 'H', icon: 'hand', options: ['handHint'], hint: 'Drag to pan · Hold Space with any tool · Middle mouse button' },
  };
  const TOOL_GROUPS = [
    ['pencil', 'eraser', 'bucket', 'gradient', 'eyedropper'],
    ['line', 'rect', 'ellipse'],
    ['dither', 'shade'],
    ['select', 'lasso', 'wand', 'move'],
    ['hand'],
  ];
  const PAINT_TOOLS = new Set(['pencil', 'eraser', 'bucket', 'gradient', 'line', 'rect', 'ellipse', 'dither', 'shade']);
  const BRUSH_TOOLS = new Set(['pencil', 'eraser', 'dither', 'shade', 'line', 'rect', 'ellipse']);
  const SHAPE_TOOLS = new Set(['line', 'rect', 'ellipse']);
  const SELECT_TOOLS = new Set(['select', 'lasso', 'wand']);

  // ===========================================================================
  // DOM
  // ===========================================================================
  const $ = (s) => document.querySelector(s);
  const dom = {
    menus: $('#menus'),
    docName: $('#doc-name'),
    optionsbar: $('#optionsbar'),
    toolbar: $('#toolbar'),
    workspace: $('#workspace'),
    view: $('#view'),
    zoomLabel: $('#zoom-label'),
    swPrimary: $('#sw-primary'),
    swSecondary: $('#sw-secondary'),
    hexInput: $('#hex-input'),
    sv: $('#sv'),
    svThumb: $('#sv-thumb'),
    hueBar: $('#hue-bar'),
    hueThumb: $('#hue-thumb'),
    alphaBar: $('#alpha-bar'),
    alphaFill: $('#alpha-fill'),
    alphaThumb: $('#alpha-thumb'),
    inR: $('#in-r'),
    inG: $('#in-g'),
    inB: $('#in-b'),
    inA: $('#in-a'),
    recent: $('#recent-colors'),
    paletteSelect: $('#palette-select'),
    paletteGrid: $('#palette-grid'),
    layerOpacity: $('#layer-opacity'),
    layerOpacityVal: $('#layer-opacity-val'),
    layerBlend: $('#layer-blend'),
    layerList: $('#layer-list'),
    previewCanvas: $('#preview-canvas'),
    previewPlay: $('#preview-play'),
    previewInfo: $('#preview-info'),
    previewScale: $('#preview-scale'),
    frames: $('#frames'),
    frameCounter: $('#frame-counter'),
    frameDuration: $('#frame-duration'),
    loopMode: $('#loop-mode'),
    btnPlay: $('#btn-play'),
    btnOnion: $('#btn-onion'),
    btnOnionSettings: $('#btn-onion-settings'),
    stHint: $('#st-hint'),
    stPos: $('#st-pos'),
    stColor: $('#st-color'),
    stSize: $('#st-size'),
    stSel: $('#st-sel'),
    stSave: $('#st-save'),
    dropdownRoot: $('#dropdown-root'),
    modalRoot: $('#modal-root'),
    toasts: $('#toasts'),
    dropOverlay: $('#drop-overlay'),
    fileOpen: $('#file-open'),
    filePalette: $('#file-palette'),
  };
  const viewCtx = dom.view.getContext('2d');

  // ===========================================================================
  // State
  // ===========================================================================
  let sprite = null; // { name, width, height, layers[], frames[], cels: Map<"layer|frame", Uint32Array> }
  let activeLayerId = null;
  let frameIndex = 0;
  let selection = null; // immutable: { mask: Uint8Array, x, y, w, h }
  let primary = Color.pack(0, 0, 0);
  let secondary = Color.pack(255, 255, 255);
  let tool = TOOLS[settings.tool] ? settings.tool : 'pencil';
  let clipboard = null; // { w, h, x, y, data: Uint32Array, mask?: Uint8Array }
  let clipboardFresh = false;
  let moveSession = null;
  let lastPaint = null;
  let playing = false;
  let playTimer = 0;
  let playDir = 1;
  let spaceDown = false;
  let altDown = false;
  let hover = null;
  let drag = null; // active pointer gesture with a tool
  let S = null; // tool-specific stroke state
  let pan = null;
  let pinch = null;
  const touches = new Map();
  let antsPhase = 0;
  let paletteSel = -1;

  // ===========================================================================
  // Document model
  // ===========================================================================
  const uid = (p) => p + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8);
  const celKey = (lid, fid) => lid + '|' + fid;

  function makeLayer(name) {
    return { id: uid('L'), name, visible: true, locked: false, opacity: 100, blend: 'normal' };
  }
  function makeFrame(duration = 100) {
    return { id: uid('F'), duration };
  }
  function createSprite(width, height, name = 'untitled') {
    return { name, width, height, layers: [makeLayer('Layer 1')], frames: [makeFrame(100)], cels: new Map() };
  }
  function activeLayer() {
    return sprite.layers.find((l) => l.id === activeLayerId) || null;
  }
  function activeLayerIndex() {
    return sprite.layers.findIndex((l) => l.id === activeLayerId);
  }
  function currentFrame() {
    return sprite.frames[frameIndex];
  }
  function getCel(lid, fid) {
    return sprite.cels.get(celKey(lid, fid)) || null;
  }
  function nextLayerName() {
    const names = new Set(sprite.layers.map((l) => l.name));
    let n = sprite.layers.length + 1;
    while (names.has('Layer ' + n)) n++;
    return 'Layer ' + n;
  }
  function makeSelection(mask) {
    const b = Geo.maskBounds(mask, sprite.width, sprite.height);
    return b ? { mask, x: b.x, y: b.y, w: b.w, h: b.h } : null;
  }

  // ===========================================================================
  // History — snapshots share cel buffers; cels are copied on first write
  // inside a transaction, so snapshots never see later mutations.
  // ===========================================================================
  const hist = { undo: [], redo: [], version: 0 };
  let tx = null;

  function snapshot() {
    return {
      width: sprite.width,
      height: sprite.height,
      layers: sprite.layers.map((l) => ({ ...l })),
      frames: sprite.frames.map((f) => ({ ...f })),
      cels: new Map(sprite.cels),
      activeLayerId,
      frameIndex,
      selection,
    };
  }

  // Layer properties and frame durations are "live" settings: undo restores
  // structure and pixels but keeps whatever visibility/opacity/name is current.
  function restoreSnapshot(s) {
    const curLayers = new Map(sprite.layers.map((l) => [l.id, l]));
    const curFrames = new Map(sprite.frames.map((f) => [f.id, f]));
    sprite.width = s.width;
    sprite.height = s.height;
    sprite.layers = s.layers.map((l) => {
      const c = curLayers.get(l.id);
      return c ? { ...l, name: c.name, visible: c.visible, locked: c.locked, opacity: c.opacity, blend: c.blend } : { ...l };
    });
    sprite.frames = s.frames.map((f) => {
      const c = curFrames.get(f.id);
      return c ? { ...f, duration: c.duration } : { ...f };
    });
    sprite.cels = new Map(s.cels);
    activeLayerId = sprite.layers.some((l) => l.id === s.activeLayerId) ? s.activeLayerId : sprite.layers[sprite.layers.length - 1].id;
    frameIndex = clamp(s.frameIndex, 0, sprite.frames.length - 1);
    selection = s.selection && s.selection.mask.length === sprite.width * sprite.height ? s.selection : null;
  }

  function begin(label, kind = 'edit') {
    if (tx) commit();
    tx = { label, kind, before: snapshot(), copied: new Set() };
  }

  function writableCel(lid, fid) {
    const k = celKey(lid, fid);
    if (tx && tx.copied.has(k)) return sprite.cels.get(k);
    const old = sprite.cels.get(k);
    const buf = old ? old.slice() : new Uint32Array(sprite.width * sprite.height);
    sprite.cels.set(k, buf);
    if (tx) tx.copied.add(k);
    return buf;
  }

  function buffersEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  const isEmptyBuffer = (b) => {
    for (let i = 0; i < b.length; i++) if (b[i]) return false;
    return true;
  };

  function commit() {
    if (!tx) return;
    const t = tx;
    tx = null;
    if (t.kind === 'stroke') {
      let changed = t.before.selection !== selection;
      if (!changed) {
        for (const k of t.copied) {
          const a = t.before.cels.get(k), b = sprite.cels.get(k);
          if (a ? !b || !buffersEqual(a, b) : b && !isEmptyBuffer(b)) {
            changed = true;
            break;
          }
        }
      }
      if (!changed) {
        for (const k of t.copied) {
          if (t.before.cels.has(k)) sprite.cels.set(k, t.before.cels.get(k));
          else sprite.cels.delete(k);
        }
        requestRender();
        return;
      }
    }
    hist.undo.push({ label: t.label, before: t.before, after: snapshot() });
    if (hist.undo.length > MAX_HISTORY) hist.undo.shift();
    hist.redo.length = 0;
    hist.version++;
    docChanged();
  }

  function abort() {
    if (!tx) return;
    const t = tx;
    tx = null;
    restoreSnapshot(t.before);
    moveSession = null;
    structStamp++;
    requestRender();
    refreshLayers();
    refreshFrames();
    refreshStatus();
  }

  function undo() {
    if (drag || tx) return;
    const e = hist.undo.pop();
    if (!e) return;
    hist.redo.push(e);
    restoreSnapshot(e.before);
    hist.version++;
    docChanged();
    toast('Undo: ' + e.label, 'info', 1100, 'history');
  }

  function redo() {
    if (drag || tx) return;
    const e = hist.redo.pop();
    if (!e) return;
    hist.undo.push(e);
    restoreSnapshot(e.after);
    hist.version++;
    docChanged();
    toast('Redo: ' + e.label, 'info', 1100, 'history');
  }

  function resetHistory() {
    hist.undo.length = 0;
    hist.redo.length = 0;
    hist.version++;
    tx = null;
  }

  function docChanged() {
    structStamp++;
    for (const id of compCache.keys()) if (!sprite.frames.some((f) => f.id === id)) compCache.delete(id);
    requestRender();
    refreshLayers();
    refreshFrames();
    refreshStatus();
    refreshHistoryButtons();
    scheduleAutosave();
  }

  // ===========================================================================
  // Compositing (cached per frame)
  // ===========================================================================
  const frameStamps = new Map();
  let structStamp = 0;
  const compCache = new Map();
  const scratch = document.createElement('canvas');
  const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
  const mergeCanvas = document.createElement('canvas');
  const mergeCtx = mergeCanvas.getContext('2d', { willReadFrequently: true });

  function touchFrame(fid) {
    frameStamps.set(fid, (frameStamps.get(fid) || 0) + 1);
    requestRender();
  }
  function ensureSize(canvas, w, h) {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  function toImageData(buf, w, h) {
    return new ImageData(new Uint8ClampedArray(buf.buffer, buf.byteOffset, w * h * 4), w, h);
  }
  function readPixels(ctx, w, h) {
    const out = new Uint32Array(ctx.getImageData(0, 0, w, h).data.buffer.slice(0));
    for (let i = 0; i < out.length; i++) if (!(out[i] >>> 24)) out[i] = 0;
    return out;
  }

  function compEntry(fi) {
    const frame = sprite.frames[fi];
    let e = compCache.get(frame.id);
    if (!e) {
      const canvas = document.createElement('canvas');
      e = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }), stamp: -1, struct: -1 };
      compCache.set(frame.id, e);
    }
    const W = sprite.width, H = sprite.height;
    const stamp = frameStamps.get(frame.id) || 0;
    if (e.stamp === stamp && e.struct === structStamp && e.canvas.width === W && e.canvas.height === H) return e;
    ensureSize(e.canvas, W, H);
    ensureSize(scratch, W, H);
    const ctx = e.ctx;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    for (const layer of sprite.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      const cel = getCel(layer.id, frame.id);
      if (!cel) continue;
      scratchCtx.putImageData(toImageData(cel, W, H), 0, 0);
      ctx.globalAlpha = layer.opacity / 100;
      ctx.globalCompositeOperation = BLEND_OP[layer.blend] || 'source-over';
      ctx.drawImage(scratch, 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    e.stamp = stamp;
    e.struct = structStamp;
    return e;
  }
  const getComposite = (fi) => compEntry(fi).canvas;
  const compositePixels = (fi) => readPixels(compEntry(fi).ctx, sprite.width, sprite.height);

  /** Draws `top` over `bottom` with an opacity and blend mode; returns new pixels. */
  function blendCels(bottom, top, opacity, blend) {
    const W = sprite.width, H = sprite.height;
    ensureSize(mergeCanvas, W, H);
    ensureSize(scratch, W, H);
    mergeCtx.globalAlpha = 1;
    mergeCtx.globalCompositeOperation = 'source-over';
    mergeCtx.clearRect(0, 0, W, H);
    if (bottom) mergeCtx.putImageData(toImageData(bottom, W, H), 0, 0);
    if (top) {
      scratchCtx.putImageData(toImageData(top, W, H), 0, 0);
      mergeCtx.globalAlpha = opacity / 100;
      mergeCtx.globalCompositeOperation = BLEND_OP[blend] || 'source-over';
      mergeCtx.drawImage(scratch, 0, 0);
      mergeCtx.globalAlpha = 1;
      mergeCtx.globalCompositeOperation = 'source-over';
    }
    return readPixels(mergeCtx, W, H);
  }

  function sampleAt(x, y, mode = 'composite') {
    if (!sprite || x < 0 || y < 0 || x >= sprite.width || y >= sprite.height) return null;
    if (mode === 'layer') {
      const l = activeLayer();
      const cel = l && getCel(l.id, currentFrame().id);
      return cel ? cel[y * sprite.width + x] : 0;
    }
    const d = compEntry(frameIndex).ctx.getImageData(x, y, 1, 1).data;
    return Color.pack(d[0], d[1], d[2], d[3]);
  }

  // ===========================================================================
  // View & rendering
  // ===========================================================================
  const view = { zoom: 8, panX: 0, panY: 0, w: 0, h: 0, dpr: 1, needsFit: true };
  let renderQueued = false;
  let checkerPattern = null;
  let checkerKey = '';
  const tintCanvas = document.createElement('canvas');
  const tintCtx = tintCanvas.getContext('2d');

  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(render);
  }

  function getChecker(c) {
    const cell = Math.max(1, Math.ceil(8 / view.zoom)) * view.zoom;
    const s = Math.max(2, Math.round(cell * view.dpr));
    const key = settings.checker + ':' + s;
    if (checkerKey !== key || !checkerPattern) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = s * 2;
      const x = cv.getContext('2d');
      const [a, b] = settings.checker === 'light' ? ['#ffffff', '#d5d6de'] : ['#3a3c49', '#2e303b'];
      x.fillStyle = a;
      x.fillRect(0, 0, s * 2, s * 2);
      x.fillStyle = b;
      x.fillRect(s, 0, s, s);
      x.fillRect(0, s, s, s);
      checkerPattern = c.createPattern(cv, 'repeat');
      checkerKey = key;
    }
    return checkerPattern;
  }

  function render() {
    renderQueued = false;
    const c = viewCtx, cw = dom.view.width, ch = dom.view.height;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, cw, ch);
    if (!sprite) return;
    const dpr = view.dpr, W = sprite.width, H = sprite.height;
    const z = view.zoom * dpr;
    const ox = Math.round(view.panX * dpr), oy = Math.round(view.panY * dpr);
    const dw = Math.round(W * z), dh = Math.round(H * z);
    const comp = getComposite(frameIndex);
    c.imageSmoothingEnabled = false;

    const tile = settings.tileMode;
    const ax = tile ? ox - dw : ox, ay = tile ? oy - dh : oy;
    const aw = tile ? dw * 3 : dw, ah = tile ? dh * 3 : dh;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)';
    c.shadowBlur = 24 * dpr;
    c.shadowOffsetY = 6 * dpr;
    c.fillStyle = '#000';
    c.fillRect(ax, ay, aw, ah);
    c.restore();

    const pat = getChecker(c);
    try {
      pat.setTransform(new DOMMatrix([1, 0, 0, 1, ox, oy]));
    } catch (_) { /* older browsers: unaligned checker is fine */ }
    c.fillStyle = pat;
    c.fillRect(ax, ay, aw, ah);

    if (tile) {
      for (let ty = -1; ty <= 1; ty++) {
        for (let tx2 = -1; tx2 <= 1; tx2++) if (tx2 || ty) c.drawImage(comp, ox + tx2 * dw, oy + ty * dh, dw, dh);
      }
      c.fillStyle = 'rgba(10,11,15,0.38)';
      c.fillRect(ax, ay, aw, dh);
      c.fillRect(ax, oy + dh, aw, dh);
      c.fillRect(ax, oy, dw, dh);
      c.fillRect(ox + dw, oy, dw, dh);
    }

    if (!settings.onionFront) drawOnion(c, ox, oy, dw, dh);
    c.drawImage(comp, ox, oy, dw, dh);
    if (settings.onionFront) drawOnion(c, ox, oy, dw, dh);
    if (tile) {
      c.strokeStyle = 'rgba(108,140,255,0.7)';
      c.lineWidth = 1;
      c.strokeRect(ox - 0.5, oy - 0.5, dw + 1, dh + 1);
    }
    drawGrid(c, ox, oy, z, cw, ch);
    drawSymmetryGuides(c, ox, oy, z, dw, dh);
    drawSelection(c, ox, oy, z);
    drawToolOverlay(c, ox, oy, z);
    drawPreview();
  }

  function drawOnion(c, ox, oy, dw, dh) {
    if (!settings.onion || playing) return;
    const n = sprite.frames.length;
    const list = [];
    for (let k = settings.onionPrev; k >= 1; k--) if (frameIndex - k >= 0) list.push([frameIndex - k, k, '#ff4d6d']);
    for (let k = settings.onionNext; k >= 1; k--) if (frameIndex + k < n) list.push([frameIndex + k, k, '#4d9dff']);
    if (!list.length) return;
    const W = sprite.width, H = sprite.height;
    ensureSize(tintCanvas, W, H);
    for (const [fi, k, tint] of list) {
      tintCtx.globalCompositeOperation = 'source-over';
      tintCtx.globalAlpha = 1;
      tintCtx.clearRect(0, 0, W, H);
      if (settings.onionLayerOnly) {
        const cel = getCel(activeLayerId, sprite.frames[fi].id);
        if (!cel) continue;
        tintCtx.putImageData(toImageData(cel, W, H), 0, 0);
      } else tintCtx.drawImage(getComposite(fi), 0, 0);
      if (settings.onionTint) {
        tintCtx.globalCompositeOperation = 'source-atop';
        tintCtx.globalAlpha = 0.55;
        tintCtx.fillStyle = tint;
        tintCtx.fillRect(0, 0, W, H);
      }
      c.globalAlpha = (settings.onionOpacity / 100) * Math.pow(0.6, k - 1);
      c.drawImage(tintCanvas, ox, oy, dw, dh);
    }
    c.globalAlpha = 1;
  }

  function drawGrid(c, ox, oy, z, cw, ch) {
    const W = sprite.width, H = sprite.height;
    const x0 = Math.max(0, Math.floor(-ox / z)), x1 = Math.min(W, Math.ceil((cw - ox) / z));
    const y0 = Math.max(0, Math.floor(-oy / z)), y1 = Math.min(H, Math.ceil((ch - oy) / z));
    if (x1 < x0 || y1 < y0) return;
    const top = Math.max(0, oy), bottom = Math.min(ch, oy + Math.round(H * z));
    const left = Math.max(0, ox), right = Math.min(cw, ox + Math.round(W * z));
    const lines = (step, color) => {
      c.beginPath();
      for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
        const px = Math.round(ox + x * z) + 0.5;
        c.moveTo(px, top);
        c.lineTo(px, bottom);
      }
      for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
        const py = Math.round(oy + y * z) + 0.5;
        c.moveTo(left, py);
        c.lineTo(right, py);
      }
      c.strokeStyle = color;
      c.lineWidth = 1;
      c.stroke();
    };
    if (settings.grid && view.zoom >= settings.gridMinZoom) lines(1, 'rgba(150,155,180,0.26)');
    const tg = settings.tileGrid | 0;
    if (tg > 1 && tg * view.zoom >= 6) lines(tg, 'rgba(108,140,255,0.6)');
  }

  function drawSymmetryGuides(c, ox, oy, z, dw, dh) {
    if (!settings.symX && !settings.symY) return;
    c.save();
    c.setLineDash([6 * view.dpr, 4 * view.dpr]);
    c.strokeStyle = 'rgba(255,181,71,0.85)';
    c.lineWidth = Math.max(1, view.dpr);
    c.beginPath();
    if (settings.symX) {
      const x = Math.round(ox + (sprite.width / 2) * z) + 0.5;
      c.moveTo(x, oy - 8 * view.dpr);
      c.lineTo(x, oy + dh + 8 * view.dpr);
    }
    if (settings.symY) {
      const y = Math.round(oy + (sprite.height / 2) * z) + 0.5;
      c.moveTo(ox - 8 * view.dpr, y);
      c.lineTo(ox + dw + 8 * view.dpr, y);
    }
    c.stroke();
    c.restore();
  }

  function selectionSegments(sel) {
    if (!sel._segs) sel._segs = Geo.maskSegments(sel.mask, sprite.width, sprite.height, sel.x, sel.y, sel.w, sel.h);
    return sel._segs;
  }

  function strokeSegments(c, segs, ox, oy, z, dx = 0, dy = 0) {
    c.beginPath();
    for (let i = 0; i < segs.length; i += 4) {
      c.moveTo(Math.round(ox + (segs[i] + dx) * z) + 0.5, Math.round(oy + (segs[i + 1] + dy) * z) + 0.5);
      c.lineTo(Math.round(ox + (segs[i + 2] + dx) * z) + 0.5, Math.round(oy + (segs[i + 3] + dy) * z) + 0.5);
    }
  }

  function drawSelection(c, ox, oy, z) {
    if (!selection) return;
    strokeSegments(c, selectionSegments(selection), ox, oy, z);
    c.lineWidth = 1;
    c.setLineDash([]);
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.stroke();
    c.setLineDash([4, 4]);
    c.lineDashOffset = -antsPhase;
    c.strokeStyle = '#ffffff';
    c.stroke();
    c.setLineDash([]);
  }

  function symmetricPoints(x, y) {
    const W = sprite.width, H = sprite.height;
    const pts = [[x, y]];
    if (settings.symX) pts.push([W - 1 - x, y]);
    if (settings.symY) pts.push([x, H - 1 - y]);
    if (settings.symX && settings.symY) pts.push([W - 1 - x, H - 1 - y]);
    return pts;
  }

  function drawToolOverlay(c, ox, oy, z) {
    const dpr = view.dpr;
    if (drag && drag.tool === 'lasso' && S && S.points && S.points.length > 1) {
      c.beginPath();
      S.points.forEach(([x, y], i) => {
        const px = ox + x * z, py = oy + y * z;
        if (i) c.lineTo(px, py);
        else c.moveTo(px, py);
      });
      c.lineWidth = 1.5 * dpr;
      c.strokeStyle = '#000';
      c.stroke();
      c.setLineDash([4 * dpr, 4 * dpr]);
      c.lineDashOffset = -antsPhase;
      c.strokeStyle = '#fff';
      c.stroke();
      c.setLineDash([]);
    }
    if (drag && drag.tool === 'gradient' && S) {
      const x0 = ox + S.x0 * z, y0 = oy + S.y0 * z, x1 = ox + S.x1 * z, y1 = oy + S.y1 * z;
      c.lineWidth = 3 * dpr;
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
      c.lineWidth = 1.5 * dpr;
      c.strokeStyle = '#fff';
      c.stroke();
      for (const [x, y, col] of [[x0, y0, S.color], [x1, y1, S.alt]]) {
        c.beginPath();
        c.arc(x, y, 5 * dpr, 0, Math.PI * 2);
        c.fillStyle = Color.toCss(col | 0xff000000);
        c.fill();
        c.lineWidth = 2 * dpr;
        c.strokeStyle = '#fff';
        c.stroke();
      }
    }
    if (!hover || pan || pinch) return;
    const t = effectiveTool();
    if (t === 'hand' || t === 'move') return;
    if (BRUSH_TOOLS.has(t) && !(drag && SHAPE_TOOLS.has(drag.tool))) {
      const b = brushShape();
      const color = t === 'eraser' ? 'rgba(255,255,255,0.28)' : Color.toCss((primary & 0x00ffffff) | (Math.round(Color.alpha(primary) * 0.6) << 24));
      for (const [hx, hy] of symmetricPoints(hover.x, hover.y)) {
        if (t !== 'shade' && Color.alpha(primary) > 0) {
          c.fillStyle = color;
          for (let k = 0; k < b.pts.length; k += 2) {
            const x = hx + b.pts[k], y = hy + b.pts[k + 1];
            const px = Math.round(ox + x * z), py = Math.round(oy + y * z);
            c.fillRect(px, py, Math.round(ox + (x + 1) * z) - px, Math.round(oy + (y + 1) * z) - py);
          }
        }
        strokeSegments(c, b.segs, ox, oy, z, hx - b.off, hy - b.off);
        c.lineWidth = 3;
        c.strokeStyle = 'rgba(0,0,0,0.55)';
        c.stroke();
        c.lineWidth = 1;
        c.strokeStyle = 'rgba(255,255,255,0.95)';
        c.stroke();
      }
      return;
    }
    if (hover.x < 0 || hover.y < 0 || hover.x >= sprite.width || hover.y >= sprite.height) return;
    const px = Math.round(ox + hover.x * z) + 0.5, py = Math.round(oy + hover.y * z) + 0.5;
    const s = Math.max(1, Math.round(z) - 1);
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    c.strokeRect(px, py, s, s);
    c.lineWidth = 1;
    c.strokeStyle = '#fff';
    c.strokeRect(px, py, s, s);
  }

  // --- viewport navigation ---------------------------------------------------
  function resizeView() {
    const r = dom.workspace.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const oldW = view.w, oldH = view.h;
    view.w = r.width;
    view.h = r.height;
    view.dpr = dpr;
    dom.view.width = Math.max(1, Math.round(r.width * dpr));
    dom.view.height = Math.max(1, Math.round(r.height * dpr));
    checkerKey = '';
    if (view.needsFit || !oldW) {
      if (sprite && r.width > 0) fitView();
    } else {
      view.panX += (view.w - oldW) / 2;
      view.panY += (view.h - oldH) / 2;
    }
    sizePreviewCanvas();
    render();
  }

  function fitView() {
    if (!sprite || !view.w) {
      view.needsFit = true;
      return;
    }
    view.needsFit = false;
    const W = sprite.width, H = sprite.height;
    const avail = Math.min((view.w - 48) / W, (view.h - 48) / H);
    let z = Math.max(MIN_ZOOM, avail);
    if (z >= 1) {
      let best = 1;
      for (const lv of ZOOM_LEVELS) if (lv <= z) best = lv;
      z = best;
    }
    view.zoom = z;
    view.panX = Math.round((view.w - W * z) / 2);
    view.panY = Math.round((view.h - H * z) / 2);
    requestRender();
    refreshZoomLabel();
  }

  function zoomAt(z, ax, ay) {
    z = clamp(z, MIN_ZOOM, MAX_ZOOM);
    const docX = (ax - view.panX) / view.zoom, docY = (ay - view.panY) / view.zoom;
    view.zoom = z;
    view.panX = Math.round(ax - docX * z);
    view.panY = Math.round(ay - docY * z);
    requestRender();
    refreshZoomLabel();
  }
  const zoomTo = (z) => zoomAt(z, view.w / 2, view.h / 2);

  function stepZoom(dir, ax = view.w / 2, ay = view.h / 2) {
    let z = view.zoom;
    if (dir > 0) z = ZOOM_LEVELS.find((l) => l > view.zoom + 1e-6) || MAX_ZOOM;
    else z = [...ZOOM_LEVELS].reverse().find((l) => l < view.zoom - 1e-6) || MIN_ZOOM;
    zoomAt(z, ax, ay);
  }

  function refreshZoomLabel() {
    dom.zoomLabel.textContent = Math.round(view.zoom * 100) + '%';
  }

  // ===========================================================================
  // Brushes & plotting
  // ===========================================================================
  let brushCache = null;
  function brushShape() {
    const n = clamp(settings.brushSize | 0, 1, 64), shape = settings.brushShape;
    if (brushCache && brushCache.n === n && brushCache.shape === shape) return brushCache;
    const off = Math.floor((n - 1) / 2), cc = (n - 1) / 2, r2 = (n / 2) ** 2 - 0.5;
    const pts = [];
    const mask = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (shape === 'circle' && n > 2 && (x - cc) ** 2 + (y - cc) ** 2 > r2) continue;
        pts.push(x - off, y - off);
        mask[y * n + x] = 1;
      }
    }
    brushCache = { n, shape, off, pts: Int16Array.from(pts), segs: Geo.maskSegments(mask, n, n) };
    return brushCache;
  }

  function plot1(x, y) {
    if (x < 0 || y < 0 || x >= S.W || y >= S.H) return;
    const i = y * S.W + x;
    if (S.mask && !S.mask[i]) return;
    S.paint(i, x, y);
  }
  function plot(x, y) {
    plot1(x, y);
    if (settings.symX) plot1(S.W - 1 - x, y);
    if (settings.symY) plot1(x, S.H - 1 - y);
    if (settings.symX && settings.symY) plot1(S.W - 1 - x, S.H - 1 - y);
  }
  function stamp(x, y) {
    const pts = brushShape().pts;
    for (let k = 0; k < pts.length; k += 2) plot(x + pts[k], y + pts[k + 1]);
  }
  function restorePixel(x, y) {
    for (const [px, py] of symmetricPoints(x, y)) {
      if (px < 0 || py < 0 || px >= S.W || py >= S.H) continue;
      const i = py * S.W + px;
      S.cel[i] = S.base[i];
    }
  }

  function paintSet(i) {
    S.cel[i] = S.color;
  }
  function paintDither(i, x, y) {
    if (BAYER4[y & 3][x & 3] < settings.ditherDensity * 16) S.cel[i] = S.color;
  }
  function paintShade(i) {
    if (S.touched[i]) return;
    S.touched[i] = 1;
    const c = S.base[i];
    if (!c) return;
    S.cel[i] = shadeColor(c, S.right ? -1 : 1);
  }
  function shadeColor(c, dir) {
    if (settings.shadeMode === 'palette') {
      const cols = palette.colors;
      const idx = cols.findIndex((p) => (p & 0xffffff) === (c & 0xffffff));
      if (idx < 0) return c;
      const j = clamp(idx + dir, 0, cols.length - 1);
      return ((cols[j] & 0xffffff) | (c & 0xff000000)) >>> 0;
    }
    const { r, g, b, a } = Color.unpack(c);
    const hsl = Color.rgbToHsl(r, g, b);
    const rgb = Color.hslToRgb(hsl.h, hsl.s, clamp(hsl.l + (dir * settings.shadeAmount) / 100, 0, 1));
    return Color.pack(rgb.r, rgb.g, rgb.b, a);
  }

  // ===========================================================================
  // Tool handlers
  // ===========================================================================
  function effectiveTool() {
    if (spaceDown) return 'hand';
    if (altDown && PAINT_TOOLS.has(tool)) return 'eyedropper';
    return tool;
  }

  function canDraw(quiet) {
    const layer = activeLayer();
    if (!layer) return false;
    if (!layer.visible) {
      if (!quiet) toast('The active layer is hidden — show it to edit', 'warn');
      return false;
    }
    if (layer.locked) {
      if (!quiet) toast('The active layer is locked', 'warn');
      return false;
    }
    return true;
  }

  function beginPaint(t, e) {
    if (!canDraw()) return false;
    stopPlayback();
    const layer = activeLayer(), frame = currentFrame();
    begin(TOOLS[t].name, 'stroke');
    const cel = writableCel(layer.id, frame.id);
    const right = e.button === 2;
    S = {
      tool: t,
      layerId: layer.id,
      frameId: frame.id,
      cel,
      base: cel.slice(),
      W: sprite.width,
      H: sprite.height,
      mask: selection ? selection.mask : null,
      color: right ? secondary : primary,
      alt: right ? primary : secondary,
      right,
      x0: 0,
      y0: 0,
      lx: 0,
      ly: 0,
      hasLast: false,
      pp: [],
      touched: null,
      paint: paintSet,
      pixelPerfect: false,
    };
    if (t === 'eraser') S.color = 0;
    else if (t !== 'shade') pushRecent(S.color);
    return true;
  }

  function freehandPoint(x, y) {
    S.lx = x;
    S.ly = y;
    S.hasLast = true;
    if (!S.pixelPerfect) {
      stamp(x, y);
      return;
    }
    const pp = S.pp;
    pp.push([x, y]);
    const n = pp.length;
    if (n >= 3) {
      const a = pp[n - 3], b = pp[n - 2], c = pp[n - 1];
      const diagonal = Math.abs(a[0] - c[0]) === 1 && Math.abs(a[1] - c[1]) === 1;
      const corner = (b[0] === a[0] && b[1] === c[1]) || (b[1] === a[1] && b[0] === c[0]);
      if (diagonal && corner) {
        restorePixel(b[0], b[1]);
        pp.splice(n - 2, 1);
      }
    }
    stamp(x, y);
    if (pp.length > 8) pp.splice(0, pp.length - 3);
  }
  function freehandTo(x, y) {
    if (!S.hasLast) return freehandPoint(x, y);
    const sx = S.lx, sy = S.ly;
    Geo.line(sx, sy, x, y, (px, py) => {
      if (px !== sx || py !== sy) freehandPoint(px, py);
    });
  }

  function paintDown(t, p, e) {
    if (!beginPaint(t, e)) return false;
    if (t === 'dither') S.paint = paintDither;
    if (t === 'shade') {
      S.paint = paintShade;
      S.touched = new Uint8Array(S.W * S.H);
    }
    S.pixelPerfect = t === 'pencil' && settings.pixelPerfect && settings.brushSize === 1;
    if (e.shiftKey && lastPaint && lastPaint.layerId === S.layerId && lastPaint.frameId === S.frameId) {
      S.lx = lastPaint.x;
      S.ly = lastPaint.y;
      S.hasLast = true;
    }
    freehandTo(p.x, p.y);
    touchFrame(S.frameId);
    return true;
  }
  function paintMove(p) {
    if (S.hasLast && p.x === S.lx && p.y === S.ly) return;
    freehandTo(p.x, p.y);
    touchFrame(S.frameId);
  }

  function snapAngle(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, adx = Math.abs(dx), ady = Math.abs(dy);
    const sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
    const ang = Math.atan2(ady, adx);
    const cands = [0, Math.atan(0.5), Math.PI / 4, Math.atan(2), Math.PI / 2];
    let best = 0;
    cands.forEach((a, i) => {
      if (Math.abs(a - ang) < Math.abs(cands[best] - ang)) best = i;
    });
    switch (best) {
      case 0: return [x1, y0];
      case 1: return [x0 + sx * adx, y0 + sy * Math.round(adx / 2)];
      case 2: {
        const d = Math.max(adx, ady);
        return [x0 + sx * d, y0 + sy * d];
      }
      case 3: return [x0 + sx * Math.round(ady / 2), y0 + sy * ady];
      default: return [x0, y1];
    }
  }

  function drawRect(x0, y0, x1, y1, filled) {
    const l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1);
    if (filled) {
      for (let y = Math.max(t, 0); y <= Math.min(b, S.H - 1); y++) {
        for (let x = Math.max(l, 0); x <= Math.min(r, S.W - 1); x++) plot(x, y);
      }
    }
    for (let x = l; x <= r; x++) {
      stamp(x, t);
      stamp(x, b);
    }
    for (let y = t; y <= b; y++) {
      stamp(l, y);
      stamp(r, y);
    }
  }

  function drawEllipse(x0, y0, x1, y1, filled) {
    const pts = Geo.ellipse(x0, y0, x1, y1);
    if (filled) {
      const rows = new Map();
      for (const [x, y] of pts) {
        const r = rows.get(y);
        if (!r) rows.set(y, [x, x]);
        else {
          if (x < r[0]) r[0] = x;
          if (x > r[1]) r[1] = x;
        }
      }
      for (const [y, [a, b]] of rows) for (let x = a; x <= b; x++) plot(x, y);
    }
    for (const [x, y] of pts) stamp(x, y);
  }

  function shapeDown(t, p, e) {
    if (!beginPaint(t, e)) return false;
    S.x0 = p.x;
    S.y0 = p.y;
    drawShape(p, e);
    touchFrame(S.frameId);
    return true;
  }
  function drawShape(p, e) {
    S.cel.set(S.base);
    let x0 = S.x0, y0 = S.y0, x1 = p.x, y1 = p.y;
    if (S.tool === 'line') {
      if (e.shiftKey) [x1, y1] = snapAngle(x0, y0, x1, y1);
      Geo.line(x0, y0, x1, y1, stamp);
      return;
    }
    if (e.shiftKey) {
      const d = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      x1 = x0 + d * (x1 < x0 ? -1 : 1);
      y1 = y0 + d * (y1 < y0 ? -1 : 1);
    }
    if (e.ctrlKey || e.metaKey) {
      x0 = S.x0 - (x1 - S.x0);
      y0 = S.y0 - (y1 - S.y0);
    }
    if (S.tool === 'rect') drawRect(x0, y0, x1, y1, settings.shapeFilled);
    else drawEllipse(x0, y0, x1, y1, settings.shapeFilled);
  }

  function bucketDown(p, e) {
    if (!beginPaint('bucket', e)) return false;
    const tol = Math.round(settings.fillTolerance * 2.55);
    for (const [x, y] of symmetricPoints(p.x, p.y)) {
      const region = Geo.floodRegion(S.cel, S.W, S.H, x, y, tol, settings.fillContiguous, S.mask);
      for (let i = 0; i < region.length; i++) if (region[i]) S.cel[i] = S.color;
    }
    touchFrame(S.frameId);
    return true;
  }

  function gradientDown(p, e) {
    if (!beginPaint('gradient', e)) return false;
    S.x0 = S.x1 = p.fx;
    S.y0 = S.y1 = p.fy;
    return true;
  }
  function drawGradient() {
    const { W, H, cel, base, mask } = S;
    cel.set(base);
    const dx = S.x1 - S.x0, dy = S.y1 - S.y0, len2 = dx * dx + dy * dy;
    if (len2 < 0.25) return;
    const b = selection || { x: 0, y: 0, w: W, h: H };
    const c0 = S.color, c1 = S.alt, dither = settings.gradientMode === 'dither';
    const A = Color.unpack(c0), B = Color.unpack(c1);
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        const i = y * W + x;
        if (mask && !mask[i]) continue;
        let t = ((x + 0.5 - S.x0) * dx + (y + 0.5 - S.y0) * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (dither) cel[i] = t > (BAYER4[y & 3][x & 3] + 0.5) / 16 ? c1 : c0;
        else {
          cel[i] = Color.pack(
            Math.round(A.r + (B.r - A.r) * t),
            Math.round(A.g + (B.g - A.g) * t),
            Math.round(A.b + (B.b - A.b) * t),
            Math.round(A.a + (B.a - A.a) * t)
          );
        }
      }
    }
  }

  function pick(p, right) {
    const c = sampleAt(p.x, p.y, settings.sampleMode);
    if (c === null) return;
    if (right) setColor('secondary', c);
    else setColor('primary', c);
  }

  // --- selection tools ------------------------------------------------------
  function combineSelection(base, mask, mode) {
    if (mode === 'replace') return makeSelection(mask);
    if (!base) return mode === 'add' ? makeSelection(mask) : null;
    const b = base.mask, out = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) {
      if (mode === 'add') out[i] = b[i] | mask[i];
      else if (mode === 'subtract') out[i] = b[i] & (mask[i] ^ 1);
      else out[i] = b[i] & mask[i];
    }
    return makeSelection(out);
  }

  function selectDown(t, p, e) {
    stopPlayback();
    const mode = e.shiftKey && e.altKey ? 'intersect' : e.shiftKey ? 'add' : e.altKey ? 'subtract' : settings.selMode;
    begin(t === 'wand' ? 'Magic Wand' : 'Select', 'stroke');
    S = {
      tool: t,
      mode,
      base: selection,
      x0: clamp(p.x, 0, sprite.width - 1),
      y0: clamp(p.y, 0, sprite.height - 1),
      moved: false,
      points: [[p.fx, p.fy]],
    };
    if (t === 'select') updateRectSelection(p);
    else if (t === 'wand') wandSelect(p);
    return true;
  }
  function updateRectSelection(p) {
    const W = sprite.width, H = sprite.height;
    const x1 = clamp(p.x, 0, W - 1), y1 = clamp(p.y, 0, H - 1);
    const l = Math.min(S.x0, x1), r = Math.max(S.x0, x1), t = Math.min(S.y0, y1), b = Math.max(S.y0, y1);
    const mask = new Uint8Array(W * H);
    for (let y = t; y <= b; y++) mask.fill(1, y * W + l, y * W + r + 1);
    selection = combineSelection(S.base, mask, S.mode);
    requestRender();
    refreshStatus();
  }
  function wandSelect(p) {
    const W = sprite.width, H = sprite.height;
    if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) {
      if (S.mode === 'replace') selection = null;
      return;
    }
    const l = activeLayer();
    const cel = (l && getCel(l.id, currentFrame().id)) || new Uint32Array(W * H);
    const mask = Geo.floodRegion(cel, W, H, p.x, p.y, Math.round(settings.wandTolerance * 2.55), settings.wandContiguous, null);
    selection = combineSelection(S.base, mask, S.mode);
    requestRender();
  }
  function selectMove(p) {
    if (S.tool === 'select') {
      if (p.x !== S.x0 || p.y !== S.y0) S.moved = true;
      updateRectSelection(p);
    } else if (S.tool === 'lasso') {
      const last = S.points[S.points.length - 1];
      if (Math.hypot(p.fx - last[0], p.fy - last[1]) * view.zoom >= 2) {
        S.points.push([p.fx, p.fy]);
        S.moved = true;
        requestRender();
      }
    }
  }
  function selectUp() {
    const W = sprite.width, H = sprite.height;
    if (S.tool === 'select' && !S.moved && S.mode === 'replace') selection = null;
    if (S.tool === 'lasso') {
      if (!S.moved || S.points.length < 3) {
        if (S.mode === 'replace') selection = null;
      } else {
        const mask = Geo.polygonMask(S.points, W, H);
        const pts = S.points.map(([x, y]) => [Math.floor(x), Math.floor(y)]);
        for (let i = 0; i < pts.length; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
          Geo.line(ax, ay, bx, by, (x, y) => {
            if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 1;
          });
        }
        selection = combineSelection(S.base, mask, S.mode);
      }
    }
    S = null;
    commit();
    requestRender();
    refreshStatus();
  }

  // --- move tool --------------------------------------------------------------
  // A move session "lifts" the selected pixels once; consecutive drags keep
  // re-placing them over the untouched base, so pixels underneath are never
  // destroyed until something else edits the document.
  function ensureMoveSession(layer, frame) {
    const W = sprite.width, H = sprite.height;
    const ms = moveSession;
    if (ms && ms.version === hist.version && ms.layerId === layer.id && ms.frameId === frame.id && ms.W === W && ms.H === H) return ms;
    const orig = getCel(layer.id, frame.id) || new Uint32Array(W * H);
    const base = orig.slice(), lifted = new Uint32Array(W * H);
    const mask = selection ? selection.mask : null;
    const b = selection || { x: 0, y: 0, w: W, h: H };
    if (mask) {
      for (let y = b.y; y < b.y + b.h; y++) {
        for (let x = b.x; x < b.x + b.w; x++) {
          const i = y * W + x;
          if (mask[i]) {
            lifted[i] = orig[i];
            base[i] = 0;
          }
        }
      }
    } else {
      lifted.set(orig);
      base.fill(0);
    }
    moveSession = { layerId: layer.id, frameId: frame.id, W, H, base, lifted, mask, sel0: selection, bx: b.x, by: b.y, bw: b.w, bh: b.h, dx: 0, dy: 0, version: hist.version };
    return moveSession;
  }
  function applyMove(ms, dx, dy) {
    const { W, H, base, lifted } = ms;
    const cel = writableCel(ms.layerId, ms.frameId);
    cel.set(base);
    for (let y = ms.by; y < ms.by + ms.bh; y++) {
      const ty = y + dy;
      if (ty < 0 || ty >= H) continue;
      for (let x = ms.bx; x < ms.bx + ms.bw; x++) {
        const tx2 = x + dx;
        if (tx2 < 0 || tx2 >= W) continue;
        const c = lifted[y * W + x];
        if (c) cel[ty * W + tx2] = c;
      }
    }
    ms.dx = dx;
    ms.dy = dy;
    if (ms.mask) selection = dx === 0 && dy === 0 ? ms.sel0 : makeSelection(Geo.shiftMask(ms.mask, W, H, dx, dy));
    touchFrame(ms.frameId);
  }
  function moveDown(p) {
    if (!canDraw()) return false;
    stopPlayback();
    begin('Move', 'stroke');
    const ms = ensureMoveSession(activeLayer(), currentFrame());
    S = { tool: 'move', ms, sx: p.x, sy: p.y, dx0: ms.dx, dy0: ms.dy };
    return true;
  }
  function moveMove(p) {
    const dx = S.dx0 + p.x - S.sx, dy = S.dy0 + p.y - S.sy;
    if (dx !== S.ms.dx || dy !== S.ms.dy) applyMove(S.ms, dx, dy);
  }
  function nudge(dx, dy) {
    if (!canDraw()) return;
    begin('Move', 'stroke');
    const ms = ensureMoveSession(activeLayer(), currentFrame());
    applyMove(ms, ms.dx + dx, ms.dy + dy);
    commit();
    ms.version = hist.version;
  }

  // --- dispatch -------------------------------------------------------------
  function toolDown(t, p, e) {
    switch (t) {
      case 'pencil':
      case 'eraser':
      case 'dither':
      case 'shade':
        return paintDown(t, p, e);
      case 'line':
      case 'rect':
      case 'ellipse':
        return shapeDown(t, p, e);
      case 'bucket':
        return bucketDown(p, e);
      case 'gradient':
        return gradientDown(p, e);
      case 'eyedropper':
        pick(p, e.button === 2);
        return true;
      case 'select':
      case 'lasso':
      case 'wand':
        return selectDown(t, p, e);
      case 'move':
        return moveDown(p);
    }
    return false;
  }

  function toolMove(t, p, e) {
    if (t === 'eyedropper') return pick(p, drag && drag.button === 2);
    if (!S) return;
    switch (t) {
      case 'pencil':
      case 'eraser':
      case 'dither':
      case 'shade':
        paintMove(p);
        break;
      case 'line':
      case 'rect':
      case 'ellipse':
        drawShape(p, e);
        touchFrame(S.frameId);
        break;
      case 'gradient':
        S.x1 = p.fx;
        S.y1 = p.fy;
        drawGradient();
        touchFrame(S.frameId);
        break;
      case 'select':
      case 'lasso':
        selectMove(p);
        break;
      case 'move':
        moveMove(p);
        break;
    }
  }

  function toolUp(t) {
    if (t === 'eyedropper' || !S) return;
    if (SELECT_TOOLS.has(t)) return selectUp();
    if (t === 'pencil' || t === 'eraser' || t === 'dither' || t === 'shade') {
      lastPaint = { layerId: S.layerId, frameId: S.frameId, x: S.lx, y: S.ly };
    }
    const wasMove = t === 'move';
    S = null;
    commit();
    if (wasMove && moveSession) moveSession.version = hist.version;
  }

  function cancelStroke() {
    if (!drag) return;
    drag = null;
    S = null;
    if (tx) abort();
    requestRender();
  }

  // ===========================================================================
  // Pointer, wheel & keyboard input
  // ===========================================================================
  function docPoint(e) {
    const r = dom.view.getBoundingClientRect();
    const fx = (e.clientX - r.left - view.panX) / view.zoom;
    const fy = (e.clientY - r.top - view.panY) / view.zoom;
    return { x: Math.floor(fx), y: Math.floor(fy), fx, fy };
  }

  function setHover(p) {
    const same = hover && p && hover.x === p.x && hover.y === p.y;
    if (same || (!hover && !p)) return;
    hover = p ? { x: p.x, y: p.y } : null;
    requestRender();
    refreshCursorStatus();
  }

  function updateCursor() {
    const t = effectiveTool();
    dom.view.style.cursor = pan ? 'grabbing' : t === 'hand' ? 'grab' : t === 'move' ? 'move' : 'crosshair';
  }

  function startPinch() {
    const [a, b] = [...touches.values()];
    const r = dom.view.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    pinch = {
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      z0: view.zoom,
      docX: (mx - view.panX) / view.zoom,
      docY: (my - view.panY) / view.zoom,
    };
  }
  function updatePinch() {
    const [a, b] = [...touches.values()];
    if (!a || !b) return;
    const r = dom.view.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    const z = clamp((pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d0, MIN_ZOOM, MAX_ZOOM);
    view.zoom = z;
    view.panX = mx - pinch.docX * z;
    view.panY = my - pinch.docY * z;
    requestRender();
    refreshZoomLabel();
  }

  function onPointerDown(e) {
    if (document.body.classList.contains('panels-open')) document.body.classList.remove('panels-open');
    closeMenus();
    const ae = document.activeElement;
    if (ae && ae !== document.body && ae.blur) ae.blur();
    altDown = e.altKey;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        cancelStroke();
        pan = null;
        startPinch();
        return;
      }
      if (touches.size > 2) return;
    }
    if (drag || pan || pinch) return;
    try {
      dom.view.setPointerCapture(e.pointerId);
    } catch (_) { /* ignore */ }
    const p = docPoint(e);
    if (e.button === 1 || spaceDown || tool === 'hand') {
      e.preventDefault();
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY, px: view.panX, py: view.panY };
      updateCursor();
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    const t = e.altKey && PAINT_TOOLS.has(tool) ? 'eyedropper' : tool;
    drag = { tool: t, id: e.pointerId, button: e.button };
    if (!toolDown(t, p, e)) drag = null;
    setHover(p);
  }

  function onPointerMove(e) {
    if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch) {
        updatePinch();
        return;
      }
    }
    if (pan && pan.id === e.pointerId) {
      view.panX = pan.px + (e.clientX - pan.x);
      view.panY = pan.py + (e.clientY - pan.y);
      requestRender();
      return;
    }
    if (altDown !== e.altKey && !drag) {
      altDown = e.altKey;
      updateCursor();
    }
    const p = docPoint(e);
    if (drag && drag.id === e.pointerId) toolMove(drag.tool, p, e);
    setHover(p);
  }

  function onPointerUp(e) {
    if (e.pointerType === 'touch') {
      touches.delete(e.pointerId);
      if (pinch) {
        if (touches.size < 2) pinch = null;
        return;
      }
    }
    if (pan && pan.id === e.pointerId) {
      pan = null;
      updateCursor();
      return;
    }
    if (drag && drag.id === e.pointerId) {
      const d = drag;
      drag = null;
      toolUp(d.tool);
      requestRender();
    }
    if (e.pointerType !== 'mouse') setHover(null);
  }

  function onPointerCancel(e) {
    touches.delete(e.pointerId);
    if (pinch && touches.size < 2) pinch = null;
    if (pan && pan.id === e.pointerId) pan = null;
    if (drag && drag.id === e.pointerId) cancelStroke();
  }

  let wheelAcc = 0;
  function onWheel(e) {
    e.preventDefault();
    const r = dom.view.getBoundingClientRect();
    const ax = e.clientX - r.left, ay = e.clientY - r.top;
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
    const dx = e.deltaX * scale, dy = e.deltaY * scale;
    if (e.ctrlKey || e.metaKey) {
      zoomAt(view.zoom * Math.exp(-dy * 0.01), ax, ay);
    } else if (e.shiftKey || Math.abs(dx) > Math.abs(dy)) {
      view.panX -= e.shiftKey && !dx ? dy : dx;
      if (!e.shiftKey) view.panY -= dy;
      requestRender();
    } else {
      wheelAcc += dy;
      if (Math.abs(wheelAcc) >= 40) {
        stepZoom(wheelAcc < 0 ? 1 : -1, ax, ay);
        wheelAcc = 0;
      }
    }
    setHover(docPoint(e));
  }

  const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'color', 'button', 'submit', 'file']);
  const isTyping = (t) =>
    !!t && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !NON_TEXT_INPUTS.has(t.type)));

  function eventCombo(e) {
    let k = e.key;
    const NAMED = { ' ': 'Space', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Esc: 'Escape', Del: 'Delete' };
    if (NAMED[k]) k = NAMED[k];
    else if (e.altKey && e.code && /^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
    else if (k.length === 1) {
      if (/^[a-z]$/i.test(k)) k = k.toUpperCase();
      else if (e.code && /^Digit\d$/.test(e.code)) k = e.code.slice(5);
    }
    const mods = [];
    if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey && (k.length > 1 || /^[A-Z0-9]$/.test(k))) mods.push('Shift');
    return [...mods, k].join('+');
  }

  function fmtKey(k) {
    if (!k) return '';
    if (!IS_MAC) return k;
    return k.replace('Ctrl+', '⌘').replace('Alt+', '⌥').replace('Shift+', '⇧');
  }

  const keymap = new Map();
  function buildKeymap() {
    for (const c of Object.values(COMMANDS)) if (!c.noBind) for (const k of c.keys) keymap.set(k, c.id);
    for (const [id, t] of Object.entries(TOOLS)) keymap.set(t.key, 'tool:' + id);
  }

  function onKeyDown(e) {
    if (e.key === 'Alt') {
      e.preventDefault();
      if (!altDown) {
        altDown = true;
        updateCursor();
        requestRender();
      }
    }
    if (modalStack.length) {
      const m = modalStack[modalStack.length - 1];
      if (e.key === 'Escape') {
        e.preventDefault();
        m.cancel();
      } else if (e.key === 'Enter' && m.primary && !['BUTTON', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault();
        m.primary.click();
      }
      return;
    }
    if (openMenuState && e.key === 'Escape') {
      closeMenus();
      return;
    }
    if (isTyping(e.target)) {
      if (e.key === 'Escape' || (e.key === 'Enter' && e.target.tagName === 'INPUT')) e.target.blur();
      return;
    }
    // A focused slider keeps its own keyboard behaviour.
    if (e.target.type === 'range' && /^(Arrow|Page|Home|End)/.test(e.key)) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (!spaceDown) {
        spaceDown = true;
        updateCursor();
        requestRender();
      }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.tagName === 'BUTTON') return;
    const combo = eventCombo(e);
    if ((combo === 'Tab' || combo === 'Shift+Tab') && document.activeElement && document.activeElement !== document.body) return;
    if (combo === 'Escape') {
      if (drag) cancelStroke();
      else if (selection) runCommand('deselect');
      closeMenus();
      return;
    }
    const arrow = /^(Shift\+)?(Left|Right|Up|Down)$/.exec(combo);
    if (arrow && (tool === 'move' || (selection && SELECT_TOOLS.has(tool)))) {
      e.preventDefault();
      if (drag) return;
      const step = arrow[1] ? 8 : 1;
      const d = { Left: [-step, 0], Right: [step, 0], Up: [0, -step], Down: [0, step] }[arrow[2]];
      nudge(d[0], d[1]);
      return;
    }
    const id = keymap.get(combo);
    if (!id) return;
    e.preventDefault();
    if (drag) return;
    if (id.startsWith('tool:')) setTool(id.slice(5));
    else runCommand(id);
  }

  function onKeyUp(e) {
    if (e.key === 'Alt' && altDown) {
      altDown = false;
      updateCursor();
      requestRender();
    }
    if (e.key === ' ' && spaceDown) {
      spaceDown = false;
      updateCursor();
      requestRender();
    }
  }

  // ===========================================================================
  // Editing operations
  // ===========================================================================
  function setTool(t) {
    if (!TOOLS[t] || drag) return;
    tool = t;
    settings.tool = t;
    persistSettings();
    refreshToolbar();
    refreshOptions();
    updateCursor();
    refreshStatus();
    requestRender();
  }

  function setBrushSize(n) {
    settings.brushSize = clamp(n | 0, 1, 64);
    persistSettings();
    refreshOptions();
    requestRender();
  }

  function toggleSetting(key) {
    settings[key] = !settings[key];
    persistSettings();
    refreshOptions();
    refreshTimelineControls();
    requestRender();
  }

  function deleteContent(label = 'Clear') {
    if (!canDraw()) return;
    const layer = activeLayer(), frame = currentFrame();
    if (!getCel(layer.id, frame.id)) return;
    begin(label, 'stroke');
    const cel = writableCel(layer.id, frame.id);
    if (selection) {
      const m = selection.mask;
      for (let i = 0; i < cel.length; i++) if (m[i]) cel[i] = 0;
    } else cel.fill(0);
    commit();
  }

  function fillSelectionWithPrimary() {
    if (!canDraw()) return;
    const layer = activeLayer(), frame = currentFrame();
    begin('Fill', 'stroke');
    const cel = writableCel(layer.id, frame.id);
    const m = selection ? selection.mask : null;
    for (let i = 0; i < cel.length; i++) if (!m || m[i]) cel[i] = primary;
    commit();
  }

  function copySelection() {
    const layer = activeLayer();
    if (!layer) return false;
    const W = sprite.width, H = sprite.height;
    const cel = getCel(layer.id, currentFrame().id);
    const b = selection || { x: 0, y: 0, w: W, h: H, mask: null };
    const data = new Uint32Array(b.w * b.h);
    const cmask = b.mask ? new Uint8Array(b.w * b.h) : null;
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        const i = (b.y + y) * W + b.x + x, j = y * b.w + x;
        if (b.mask && !b.mask[i]) continue;
        if (cmask) cmask[j] = 1;
        data[j] = cel ? cel[i] : 0;
      }
    }
    clipboard = { w: b.w, h: b.h, x: b.x, y: b.y, data, mask: cmask };
    clipboardFresh = true;
    writeSystemClipboard(clipboard);
    return true;
  }

  function writeSystemClipboard(clip) {
    try {
      if (!navigator.clipboard || !window.ClipboardItem || !window.isSecureContext) return;
      const cv = el('canvas', { width: clip.w, height: clip.h });
      cv.getContext('2d').putImageData(toImageData(clip.data, clip.w, clip.h), 0, 0);
      const blob = new Promise((res) => cv.toBlob(res, 'image/png'));
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {});
    } catch (_) { /* clipboard access is optional */ }
  }

  function pasteClip(clip) {
    if (!clip) {
      toast('Nothing to paste', 'warn');
      return;
    }
    if (!canDraw()) return;
    stopPlayback();
    const layer = activeLayer(), frame = currentFrame();
    const W = sprite.width, H = sprite.height;
    const px = clamp(clip.x || 0, 0, Math.max(0, W - clip.w)), py = clamp(clip.y || 0, 0, Math.max(0, H - clip.h));
    const lifted = new Uint32Array(W * H), mask = new Uint8Array(W * H);
    for (let y = 0; y < clip.h; y++) {
      const ty = py + y;
      if (ty >= H) break;
      for (let x = 0; x < clip.w; x++) {
        const tx2 = px + x;
        if (tx2 >= W) break;
        const j = y * clip.w + x;
        if (clip.mask && !clip.mask[j]) continue;
        lifted[ty * W + tx2] = clip.data[j];
        mask[ty * W + tx2] = 1;
      }
    }
    const sel = makeSelection(mask);
    if (!sel) return;
    begin('Paste');
    const orig = getCel(layer.id, frame.id);
    moveSession = {
      layerId: layer.id,
      frameId: frame.id,
      W,
      H,
      base: orig ? orig.slice() : new Uint32Array(W * H),
      lifted,
      mask,
      sel0: sel,
      bx: sel.x,
      by: sel.y,
      bw: sel.w,
      bh: sel.h,
      dx: 0,
      dy: 0,
      version: -1,
    };
    applyMove(moveSession, 0, 0);
    commit();
    moveSession.version = hist.version;
    setTool('move');
    if (clip.w > W || clip.h > H) toast('The pasted image is larger than the canvas and was cropped', 'warn', 3500);
  }

  function transformContent(kind) {
    if (!canDraw()) return;
    const LABELS = { flipH: 'Flip Horizontal', flipV: 'Flip Vertical', rotCW: 'Rotate 90° CW', rotCCW: 'Rotate 90° CCW', rot180: 'Rotate 180°' };
    const layer = activeLayer(), frame = currentFrame(), W = sprite.width, H = sprite.height;
    begin(LABELS[kind], 'stroke');
    const cel = writableCel(layer.id, frame.id);
    const sel = selection;
    const b = sel || { x: 0, y: 0, w: W, h: H };
    const src = new Uint32Array(b.w * b.h), smask = new Uint8Array(b.w * b.h);
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        const i = (b.y + y) * W + b.x + x;
        if (sel && !sel.mask[i]) continue;
        src[y * b.w + x] = cel[i];
        smask[y * b.w + x] = 1;
        cel[i] = 0;
      }
    }
    const r = Geo.transformBlock(src, smask, b.w, b.h, kind);
    const nx = b.x + Math.floor((b.w - r.w) / 2), ny = b.y + Math.floor((b.h - r.h) / 2);
    const newMask = sel ? new Uint8Array(W * H) : null;
    for (let y = 0; y < r.h; y++) {
      const ty = ny + y;
      if (ty < 0 || ty >= H) continue;
      for (let x = 0; x < r.w; x++) {
        const tx2 = nx + x;
        if (tx2 < 0 || tx2 >= W) continue;
        const j = y * r.w + x;
        if (!r.mask[j]) continue;
        cel[ty * W + tx2] = r.data[j];
        if (newMask) newMask[ty * W + tx2] = 1;
      }
    }
    if (sel) selection = makeSelection(newMask);
    commit();
  }

  // --- selection commands ---------------------------------------------------
  function setSelection(sel, label) {
    begin(label, 'stroke');
    selection = sel;
    commit();
    requestRender();
    refreshStatus();
  }
  function selectAll() {
    setSelection(makeSelection(new Uint8Array(sprite.width * sprite.height).fill(1)), 'Select All');
  }
  function deselect() {
    if (selection) setSelection(null, 'Deselect');
  }
  function invertSelection() {
    const n = sprite.width * sprite.height, out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = selection ? selection.mask[i] ^ 1 : 1;
    setSelection(makeSelection(out), 'Invert Selection');
  }
  function selectOpaque() {
    const l = activeLayer();
    const cel = l && getCel(l.id, currentFrame().id);
    const n = sprite.width * sprite.height, out = new Uint8Array(n);
    if (cel) for (let i = 0; i < n; i++) out[i] = cel[i] ? 1 : 0;
    setSelection(makeSelection(out), 'Select Layer Pixels');
  }

  // --- pixel operations -----------------------------------------------------
  function scopeTargets(scope) {
    const layers = scope === 'cel' || scope === 'layer' ? [activeLayer()] : sprite.layers;
    const frames = scope === 'cel' || scope === 'frame' ? [currentFrame()] : sprite.frames;
    const out = [];
    for (const l of layers) {
      if (!l || l.locked) continue;
      for (const f of frames) if (getCel(l.id, f.id)) out.push([l.id, f.id]);
    }
    return out;
  }

  function applyPixelOp(label, scope, fn) {
    if ((scope === 'cel' || scope === 'layer') && !canDraw()) return;
    const targets = scopeTargets(scope);
    if (!targets.length) {
      toast('Nothing to apply to — the layer is empty', 'warn');
      return;
    }
    begin(label, 'stroke');
    const mask = selection ? selection.mask : null;
    for (const [lid, fid] of targets) {
      const cel = writableCel(lid, fid);
      for (let i = 0; i < cel.length; i++) {
        if (mask && !mask[i]) continue;
        const c = cel[i];
        if (c) cel[i] = fn(c);
      }
    }
    commit();
  }

  const invertColor = (c) => ((~c & 0x00ffffff) | (c & 0xff000000)) >>> 0;
  function desaturateColor(c) {
    const v = Math.round(Color.luma(c) * 255);
    return Color.pack(v, v, v, Color.alpha(c));
  }

  function adjustColor(c, st) {
    let { r, g, b, a } = Color.unpack(c);
    if (st.contrast) {
      const f = st.contrast > 0 ? 1 + st.contrast / 50 : 1 + st.contrast / 100;
      r = clamp((r - 128) * f + 128, 0, 255);
      g = clamp((g - 128) * f + 128, 0, 255);
      b = clamp((b - 128) * f + 128, 0, 255);
    }
    if (st.hue || st.sat || st.light) {
      const hsl = Color.rgbToHsl(r, g, b);
      const h = (hsl.h + st.hue + 360) % 360;
      let s = hsl.s;
      if (s > 0) s = st.sat >= 0 ? s + (1 - s) * (st.sat / 100) : s * (1 + st.sat / 100);
      const l = st.light >= 0 ? hsl.l + (1 - hsl.l) * (st.light / 100) : hsl.l * (1 + st.light / 100);
      const rgb = Color.hslToRgb(h, clamp(s, 0, 1), clamp(l, 0, 1));
      r = rgb.r;
      g = rgb.g;
      b = rgb.b;
    }
    return Color.pack(Math.round(r), Math.round(g), Math.round(b), a);
  }

  /**
   * Opens a transaction for a live-preview dialog. `compute(base, cel, mask)`
   * writes a preview from the untouched base into the cel for each target.
   */
  function livePreview(label) {
    stopPlayback();
    begin(label, 'stroke');
    const bases = new Map();
    return {
      run(scope, compute) {
        for (const [k, base] of bases) sprite.cels.get(k).set(base);
        const mask = selection ? selection.mask : null;
        for (const [lid, fid] of scopeTargets(scope)) {
          const k = celKey(lid, fid);
          if (!bases.has(k)) bases.set(k, writableCel(lid, fid).slice());
          compute(bases.get(k), sprite.cels.get(k), mask);
        }
        structStamp++;
        requestRender();
      },
      commit() {
        commit();
      },
      cancel() {
        abort();
      },
    };
  }

  function outlinePixels(base, cel, mask, st) {
    const W = sprite.width, H = sprite.height;
    const nb = st.diag ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[0, -1], [-1, 0], [1, 0], [0, 1]];
    const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < H && base[y * W + x] !== 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (mask && !mask[i]) continue;
        const self = base[i] !== 0;
        if (st.mode === 'outside' ? self : !self) continue;
        for (const [dx, dy] of nb) {
          if (opaque(x + dx, y + dy) !== self) {
            cel[i] = st.color;
            break;
          }
        }
      }
    }
  }

  // --- layers ------------------------------------------------------------------
  function selectLayer(id) {
    if (activeLayerId === id) return;
    activeLayerId = id;
    refreshLayers();
    refreshStatus();
  }
  function stepLayer(dir) {
    const i = clamp(activeLayerIndex() + dir, 0, sprite.layers.length - 1);
    selectLayer(sprite.layers[i].id);
  }
  function addLayer() {
    begin('New Layer');
    const layer = makeLayer(nextLayerName());
    sprite.layers.splice(activeLayerIndex() + 1, 0, layer);
    activeLayerId = layer.id;
    commit();
  }
  function duplicateLayer() {
    const src = activeLayer();
    if (!src) return;
    begin('Duplicate Layer');
    const layer = { ...src, id: uid('L'), name: src.name + ' copy', locked: false };
    for (const f of sprite.frames) {
      const cel = getCel(src.id, f.id);
      if (cel) sprite.cels.set(celKey(layer.id, f.id), cel.slice());
    }
    sprite.layers.splice(activeLayerIndex() + 1, 0, layer);
    activeLayerId = layer.id;
    commit();
  }
  function deleteLayer() {
    if (sprite.layers.length <= 1) {
      toast('A sprite needs at least one layer', 'warn');
      return;
    }
    const idx = activeLayerIndex();
    const layer = sprite.layers[idx];
    begin('Delete Layer');
    for (const f of sprite.frames) sprite.cels.delete(celKey(layer.id, f.id));
    sprite.layers.splice(idx, 1);
    activeLayerId = sprite.layers[Math.max(0, idx - 1)].id;
    commit();
  }
  function mergeDown() {
    const idx = activeLayerIndex();
    if (idx <= 0) return;
    const top = sprite.layers[idx], below = sprite.layers[idx - 1];
    begin('Merge Down');
    for (const f of sprite.frames) {
      const ct = getCel(top.id, f.id);
      if (ct) {
        const merged = blendCels(getCel(below.id, f.id), ct, top.visible ? top.opacity : 0, top.blend);
        sprite.cels.set(celKey(below.id, f.id), merged);
      }
      sprite.cels.delete(celKey(top.id, f.id));
    }
    sprite.layers.splice(idx, 1);
    activeLayerId = below.id;
    commit();
  }
  function flatten() {
    if (sprite.layers.length < 2) return;
    begin('Flatten');
    const layer = makeLayer('Flattened');
    const cels = new Map();
    sprite.frames.forEach((f, fi) => {
      const px = compositePixels(fi);
      if (!isEmptyBuffer(px)) cels.set(celKey(layer.id, f.id), px);
    });
    sprite.layers = [layer];
    sprite.cels = cels;
    activeLayerId = layer.id;
    commit();
  }
  function moveLayer(dir) {
    const i = activeLayerIndex(), j = i + dir;
    if (j < 0 || j >= sprite.layers.length) return;
    begin('Move Layer');
    const [l] = sprite.layers.splice(i, 1);
    sprite.layers.splice(j, 0, l);
    commit();
  }
  function moveLayerTo(srcId, targetId, above) {
    const from = sprite.layers.findIndex((l) => l.id === srcId);
    let to = sprite.layers.findIndex((l) => l.id === targetId) + (above ? 1 : 0);
    if (from < 0 || to < 0) return;
    if (from < to) to--;
    if (from === to) return;
    begin('Reorder Layers');
    const [l] = sprite.layers.splice(from, 1);
    sprite.layers.splice(to, 0, l);
    commit();
  }
  function layerPropsChanged() {
    structStamp++;
    requestRender();
    scheduleThumbs();
    scheduleAutosave();
  }
  function toggleLayerVisible(id, solo) {
    const layer = sprite.layers.find((l) => l.id === id);
    if (!layer) return;
    if (solo) {
      const others = sprite.layers.filter((l) => l !== layer);
      const soloed = layer.visible && others.every((l) => !l.visible);
      for (const l of others) l.visible = soloed;
      layer.visible = true;
    } else layer.visible = !layer.visible;
    layerPropsChanged();
    refreshLayers();
  }
  function toggleLayerLock(id) {
    const layer = sprite.layers.find((l) => l.id === id);
    if (!layer) return;
    layer.locked = !layer.locked;
    scheduleAutosave();
    refreshLayers();
  }

  // --- frames ------------------------------------------------------------------
  function setFrame(i, fromPlayback = false) {
    if (!sprite) return;
    i = clamp(i, 0, sprite.frames.length - 1);
    if (!fromPlayback) stopPlayback();
    if (i === frameIndex && !fromPlayback) return;
    frameIndex = i;
    requestRender();
    updateFrameSelection();
    refreshTimelineControls();
    scheduleThumbs();
    refreshStatus();
  }
  function stepFrame(dir) {
    const n = sprite.frames.length;
    setFrame((frameIndex + dir + n) % n);
  }
  function addFrame(duplicate) {
    stopPlayback();
    begin(duplicate ? 'Duplicate Frame' : 'New Frame');
    const cur = currentFrame();
    const frame = makeFrame(cur.duration);
    if (duplicate) {
      for (const l of sprite.layers) {
        const cel = getCel(l.id, cur.id);
        if (cel) sprite.cels.set(celKey(l.id, frame.id), cel.slice());
      }
    }
    sprite.frames.splice(frameIndex + 1, 0, frame);
    frameIndex++;
    commit();
  }
  function deleteFrame() {
    if (sprite.frames.length <= 1) {
      toast('A sprite needs at least one frame', 'warn');
      return;
    }
    stopPlayback();
    begin('Delete Frame');
    const f = currentFrame();
    for (const l of sprite.layers) sprite.cels.delete(celKey(l.id, f.id));
    sprite.frames.splice(frameIndex, 1);
    frameIndex = Math.min(frameIndex, sprite.frames.length - 1);
    commit();
  }
  function moveFrame(dir) {
    const j = frameIndex + dir;
    if (j < 0 || j >= sprite.frames.length) return;
    moveFrameTo(frameIndex, j);
  }
  function moveFrameTo(from, to) {
    if (from === to) return;
    stopPlayback();
    begin('Move Frame');
    const [f] = sprite.frames.splice(from, 1);
    sprite.frames.splice(to, 0, f);
    frameIndex = to;
    commit();
  }
  function reverseFrames() {
    stopPlayback();
    begin('Reverse Frames');
    const cur = currentFrame();
    sprite.frames.reverse();
    frameIndex = sprite.frames.indexOf(cur);
    commit();
  }

  // --- whole-sprite transforms --------------------------------------------------
  function replaceAllCels(label, nw, nh, mapFn) {
    stopPlayback();
    begin(label);
    const cels = new Map();
    for (const [k, buf] of sprite.cels) {
      const out = mapFn(buf);
      if (out && !isEmptyBuffer(out)) cels.set(k, out);
    }
    sprite.cels = cels;
    const resized = nw !== sprite.width || nh !== sprite.height;
    sprite.width = nw;
    sprite.height = nh;
    selection = null;
    moveSession = null;
    commit();
    if (resized) fitView();
  }
  function transformSprite(kind) {
    const W = sprite.width, H = sprite.height;
    const rot = kind === 'rotCW' || kind === 'rotCCW';
    const LABELS = { flipH: 'Flip Canvas Horizontal', flipV: 'Flip Canvas Vertical', rotCW: 'Rotate Canvas 90° CW', rotCCW: 'Rotate Canvas 90° CCW', rot180: 'Rotate Canvas 180°' };
    replaceAllCels(LABELS[kind], rot ? H : W, rot ? W : H, (buf) => Geo.transformBlock(buf, null, W, H, kind).data);
  }
  function resizeCanvas(nw, nh, ax, ay) {
    const W = sprite.width, H = sprite.height;
    const dx = Math.round((nw - W) * ax), dy = Math.round((nh - H) * ay);
    replaceAllCels('Canvas Size', nw, nh, (buf) => crop(buf, W, H, -dx, -dy, nw, nh));
  }
  function crop(buf, W, H, sx, sy, nw, nh) {
    const out = new Uint32Array(nw * nh);
    for (let y = 0; y < nh; y++) {
      const yy = y + sy;
      if (yy < 0 || yy >= H) continue;
      for (let x = 0; x < nw; x++) {
        const xx = x + sx;
        if (xx >= 0 && xx < W) out[y * nw + x] = buf[yy * W + xx];
      }
    }
    return out;
  }
  function scaleSprite(nw, nh) {
    const W = sprite.width, H = sprite.height;
    replaceAllCels('Sprite Size', nw, nh, (buf) => {
      const out = new Uint32Array(nw * nh);
      for (let y = 0; y < nh; y++) {
        const sy = Math.min(H - 1, Math.floor(((y + 0.5) * H) / nh));
        for (let x = 0; x < nw; x++) out[y * nw + x] = buf[sy * W + Math.min(W - 1, Math.floor(((x + 0.5) * W) / nw))];
      }
      return out;
    });
  }
  function cropToSelection() {
    if (!selection) return;
    const { x, y, w, h } = selection, W = sprite.width, H = sprite.height;
    replaceAllCels('Crop', w, h, (buf) => crop(buf, W, H, x, y, w, h));
  }
  function trimSprite() {
    const W = sprite.width, H = sprite.height, any = new Uint8Array(W * H);
    for (const buf of sprite.cels.values()) for (let i = 0; i < buf.length; i++) if (buf[i]) any[i] = 1;
    const b = Geo.maskBounds(any, W, H);
    if (!b) {
      toast('The sprite is empty — nothing to trim', 'warn');
      return;
    }
    if (b.w === W && b.h === H) {
      toast('Nothing to trim');
      return;
    }
    replaceAllCels('Trim', b.w, b.h, (buf) => crop(buf, W, H, b.x, b.y, b.w, b.h));
  }

  // ===========================================================================
  // Playback & preview
  // ===========================================================================
  function nextPlayIndex(i, dirRef) {
    const n = sprite.frames.length;
    if (n < 2) return 0;
    let next = i + dirRef.dir;
    if (settings.loopMode === 'pingpong') {
      if (next >= n || next < 0) {
        dirRef.dir = -dirRef.dir;
        next = i + dirRef.dir;
      }
    } else if (next >= n) next = 0;
    return clamp(next, 0, n - 1);
  }
  const playDirRef = { dir: 1 };
  function startPlayback() {
    if (sprite.frames.length < 2) {
      toast('Add more frames to play an animation', 'info');
      return;
    }
    playing = true;
    playDirRef.dir = playDir;
    const tick = () => {
      if (!playing) return;
      playTimer = setTimeout(() => {
        if (!playing) return;
        setFrame(nextPlayIndex(frameIndex, playDirRef), true);
        tick();
      }, currentFrame().duration);
    };
    tick();
    refreshTimelineControls();
    requestRender();
  }
  function stopPlayback() {
    if (!playing) return;
    playing = false;
    clearTimeout(playTimer);
    refreshTimelineControls();
    requestRender();
  }
  function togglePlay() {
    if (playing) stopPlayback();
    else startPlayback();
  }
  function toggleOnion() {
    settings.onion = !settings.onion;
    persistSettings();
    refreshTimelineControls();
    requestRender();
  }

  const preview = { playing: false, index: 0, timer: 0, dir: { dir: 1 } };
  function sizePreviewCanvas() {
    const cv = dom.previewCanvas;
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    ensureSize(cv, Math.round(r.width * dpr), Math.round(r.height * dpr));
  }
  function drawPreview() {
    const cv = dom.previewCanvas;
    if (!sprite || !cv.width || cv.closest('.panel.collapsed')) return;
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const fi = preview.playing ? clamp(preview.index, 0, sprite.frames.length - 1) : frameIndex;
    const W = sprite.width, H = sprite.height;
    const dpr = window.devicePixelRatio || 1;
    let s = Number(settings.previewScale) * dpr;
    if (!s) {
      s = Math.min((cv.width - 8 * dpr) / W, (cv.height - 8 * dpr) / H);
      if (s >= 1) s = Math.floor(s);
    }
    const dw = Math.max(1, Math.round(W * s)), dh = Math.max(1, Math.round(H * s));
    ctx.imageSmoothingEnabled = s < 1;
    ctx.drawImage(getComposite(fi), Math.floor((cv.width - dw) / 2), Math.floor((cv.height - dh) / 2), dw, dh);
    dom.previewInfo.textContent = `${fi + 1} / ${sprite.frames.length}`;
  }
  function togglePreview() {
    preview.playing = !preview.playing;
    clearTimeout(preview.timer);
    if (preview.playing) {
      preview.index = frameIndex;
      const tick = () => {
        preview.timer = setTimeout(() => {
          if (!preview.playing || !sprite) return;
          preview.index = nextPlayIndex(clamp(preview.index, 0, sprite.frames.length - 1), preview.dir);
          drawPreview();
          tick();
        }, sprite.frames[clamp(preview.index, 0, sprite.frames.length - 1)].duration);
      };
      tick();
    }
    dom.previewPlay.replaceChildren(icon(preview.playing ? 'pause' : 'play'));
    dom.previewPlay.classList.toggle('active', preview.playing);
    drawPreview();
  }
  function stopPreview() {
    if (preview.playing) togglePreview();
  }

  // ===========================================================================
  // Colors & palette
  // ===========================================================================
  const picker = { target: 'primary', h: 0, s: 0, v: 0, a: 255 };
  const pickerColor = () => (picker.target === 'primary' ? primary : secondary);

  function syncPicker() {
    const { r, g, b, a } = Color.unpack(pickerColor());
    const hsv = Color.rgbToHsv(r, g, b);
    if (hsv.v > 0 && hsv.s > 0) picker.h = hsv.h;
    if (hsv.v > 0) picker.s = hsv.s;
    picker.v = hsv.v;
    picker.a = a;
  }
  function applyPicker() {
    const { r, g, b } = Color.hsvToRgb(picker.h, picker.s, picker.v);
    setColor(picker.target, Color.pack(r, g, b, Math.round(picker.a)), false);
  }
  function setColor(which, c, sync = true) {
    if (which === 'primary') primary = c >>> 0;
    else secondary = c >>> 0;
    if (sync && which === picker.target) syncPicker();
    refreshColors();
    requestRender();
  }
  function setPickerTarget(which) {
    picker.target = which;
    syncPicker();
    refreshColors();
  }
  function swapColors() {
    [primary, secondary] = [secondary, primary];
    syncPicker();
    refreshColors();
    requestRender();
  }
  function resetColors() {
    primary = Color.pack(0, 0, 0);
    secondary = Color.pack(255, 255, 255);
    syncPicker();
    refreshColors();
  }

  let recentColors = (readJSON(KEYS.recent, []) || []).map(Color.fromHex).filter((c) => c !== null).slice(0, 16);
  function pushRecent(c) {
    if (!c) return;
    const i = recentColors.indexOf(c);
    if (i === 0) return;
    if (i > 0) recentColors.splice(i, 1);
    recentColors.unshift(c);
    recentColors.length = Math.min(recentColors.length, 16);
    writeJSON(KEYS.recent, recentColors.map((x) => Color.toHex(x)));
    refreshRecent();
  }

  function loadPalette() {
    const saved = readJSON(KEYS.palette, null);
    if (saved && Array.isArray(saved.colors)) {
      return { name: String(saved.name || 'Custom'), colors: saved.colors.map(Color.fromHex).filter((c) => c !== null) };
    }
    return { name: PALETTES[0].name, colors: PALETTES[0].colors.map(Color.fromHex) };
  }
  let palette = loadPalette();
  function savePalette() {
    writeJSON(KEYS.palette, { name: palette.name, colors: palette.colors.map((c) => Color.toHex(c)) });
  }
  function setPalette(name, colors) {
    palette = { name, colors: colors.slice(0, 256) };
    paletteSel = -1;
    savePalette();
    refreshPalette();
  }
  function paletteModified() {
    if (PALETTES.some((p) => p.name === palette.name)) palette.name = palette.name + ' (edited)';
    savePalette();
    refreshPalette();
  }
  function sortColors(colors) {
    return colors.slice().sort((a, b) => {
      const A = Color.unpack(a), B = Color.unpack(b);
      const ha = Color.rgbToHsl(A.r, A.g, A.b), hb = Color.rgbToHsl(B.r, B.g, B.b);
      const ga = ha.s < 0.12, gb = hb.s < 0.12;
      if (ga !== gb) return ga ? 1 : -1;
      if (ga) return ha.l - hb.l;
      const bucketA = Math.round(ha.h / 30) % 12, bucketB = Math.round(hb.h / 30) % 12;
      return bucketA - bucketB || ha.l - hb.l;
    });
  }
  function extractPalette() {
    const set = new Set();
    for (const buf of sprite.cels.values()) {
      for (let i = 0; i < buf.length; i++) {
        if (buf[i]) set.add(buf[i]);
        if (set.size > 256) break;
      }
      if (set.size > 256) break;
    }
    if (!set.size) {
      toast('The sprite has no colors yet', 'warn');
      return;
    }
    setPalette('From sprite', sortColors([...set]));
    toast(`Extracted ${palette.colors.length} colors${set.size > 256 ? ' (first 256)' : ''}`, 'ok');
  }
  function parsePaletteText(text) {
    const colors = [];
    const lines = text.split(/\r?\n/);
    if (/^GIMP Palette/i.test(lines[0] || '')) {
      for (const line of lines.slice(1)) {
        const m = /^\s*(\d+)\s+(\d+)\s+(\d+)/.exec(line);
        if (m) colors.push(Color.pack(+m[1], +m[2], +m[3]));
      }
      return colors;
    }
    for (const line of lines) {
      const s = line.trim();
      if (!s || s.startsWith(';') || s.startsWith('#!')) continue;
      const m = /^#?([0-9a-f]{8}|[0-9a-f]{6})$/i.exec(s);
      if (!m) continue;
      if (m[1].length === 8) {
        const argb = m[1];
        colors.push(Color.fromHex('#' + argb.slice(2) + argb.slice(0, 2)));
      } else colors.push(Color.fromHex('#' + m[1]));
    }
    return colors.filter((c) => c !== null);
  }
  async function importPaletteFile(file) {
    try {
      let colors;
      if (file.type.startsWith('image/')) {
        const img = await imageFileToPixels(file);
        const set = new Set();
        for (const c of img.px) if (c) set.add(c);
        colors = [...set].slice(0, 256);
      } else colors = parsePaletteText(await file.text());
      if (!colors.length) throw new Error('No colors found in that file');
      setPalette(file.name.replace(/\.[^.]+$/, ''), colors);
      toast(`Imported ${colors.length} colors`, 'ok');
    } catch (err) {
      toast(err.message || 'Could not import palette', 'error');
    }
  }
  function exportPalette() {
    const text = palette.colors.map((c) => Color.toHex(c, false).slice(1)).join('\n') + '\n';
    downloadBlob(new Blob([text], { type: 'text/plain' }), safeFileName(palette.name, 'palette') + '.hex');
  }

  // ===========================================================================
  // UI refreshers
  // ===========================================================================
  function refreshColors() {
    const set = (btn, c) => {
      btn.firstElementChild.style.background = Color.toCss(c);
    };
    set(dom.swPrimary, primary);
    set(dom.swSecondary, secondary);
    dom.swPrimary.classList.toggle('editing', picker.target === 'primary');
    dom.swSecondary.classList.toggle('editing', picker.target === 'secondary');
    const tbp = $('#tb-primary'), tbs = $('#tb-secondary');
    if (tbp) tbp.firstElementChild.style.background = Color.toCss(primary);
    if (tbs) tbs.firstElementChild.style.background = Color.toCss(secondary);

    const c = pickerColor();
    const { r, g, b, a } = Color.unpack(c);
    const opaque = Color.hsvToRgb(picker.h, 1, 1);
    dom.sv.style.background = `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgb(${opaque.r},${opaque.g},${opaque.b}))`;
    dom.svThumb.style.left = picker.s * 100 + '%';
    dom.svThumb.style.top = (1 - picker.v) * 100 + '%';
    dom.svThumb.style.background = `rgb(${r},${g},${b})`;
    dom.hueThumb.style.left = (picker.h / 360) * 100 + '%';
    dom.alphaFill.style.background = `linear-gradient(to right, rgba(${r},${g},${b},0), rgb(${r},${g},${b}))`;
    dom.alphaThumb.style.left = (picker.a / 255) * 100 + '%';
    if (document.activeElement !== dom.hexInput) dom.hexInput.value = a === 0 ? 'transparent' : Color.toHex(c);
    const fields = [[dom.inR, r], [dom.inG, g], [dom.inB, b], [dom.inA, a]];
    for (const [inp, v] of fields) if (document.activeElement !== inp) inp.value = v;

    dom.paletteGrid.querySelectorAll('.pal-swatch').forEach((sw) => {
      const pc = palette.colors[+sw.dataset.i];
      sw.classList.toggle('is-primary', pc === primary);
      sw.classList.toggle('is-secondary', pc === secondary);
    });
  }

  function refreshRecent() {
    dom.recent.replaceChildren(
      ...recentColors.map((c) =>
        el('button', {
          class: 'recent-swatch',
          title: Color.toHex(c) + ' — click: primary · right click: secondary',
          style: { '--c': Color.toCss(c) },
          onclick: () => setColor('primary', c),
          oncontextmenu: (e) => {
            e.preventDefault();
            setColor('secondary', c);
          },
        })
      )
    );
    if (!recentColors.length) dom.recent.append(el('span', { class: 'muted small' }, 'Colors you paint with appear here'));
  }

  function refreshPalette() {
    const sel = dom.paletteSelect;
    sel.replaceChildren(...PALETTES.map((p) => el('option', { value: p.name }, p.name)));
    if (!PALETTES.some((p) => p.name === palette.name)) sel.prepend(el('option', { value: palette.name }, palette.name));
    sel.value = palette.name;
    dom.paletteGrid.replaceChildren(
      ...palette.colors.map((c, i) =>
        el('button', {
          class: 'pal-swatch' + (i === paletteSel ? ' selected' : ''),
          style: { '--c': Color.toCss(c) },
          title: `${Color.toHex(c)} — click: primary · right click: secondary`,
          dataset: { i },
        })
      )
    );
    if (!palette.colors.length) dom.paletteGrid.append(el('span', { class: 'muted small' }, 'Empty palette — add colors with +'));
    refreshColors();
  }

  function buildToolbar() {
    dom.toolbar.replaceChildren();
    TOOL_GROUPS.forEach((group, gi) => {
      if (gi) dom.toolbar.append(el('div', { class: 'tb-sep' }));
      for (const t of group) {
        const d = TOOLS[t];
        dom.toolbar.append(
          el('button', { class: 'tool', dataset: { tool: t }, title: `${d.name} (${fmtKey(d.key)})`, 'aria-label': d.name, onclick: () => setTool(t) }, icon(d.icon))
        );
      }
    });
    dom.toolbar.append(
      el('div', { class: 'tb-grow' }),
      el(
        'div',
        { class: 'tb-colors' },
        el('button', { class: 'tb-color primary', id: 'tb-primary', title: 'Primary color', onclick: () => openColorPanel('primary') }, el('span')),
        el('button', { class: 'tb-color secondary', id: 'tb-secondary', title: 'Secondary color', onclick: () => openColorPanel('secondary') }, el('span')),
        el('button', { class: 'tb-swap', title: `Swap colors (${fmtKey('X')})`, onclick: swapColors }, icon('swap'))
      )
    );
  }
  function openColorPanel(which) {
    setPickerTarget(which);
    if (!panelsVisible()) togglePanels();
    const panel = document.querySelector('[data-panel="color"]');
    panel.classList.remove('collapsed');
    panel.scrollIntoView({ block: 'nearest' });
  }
  function refreshToolbar() {
    dom.toolbar.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
  }

  // --- tool options bar -------------------------------------------------------
  function optGroup(label, ...controls) {
    return el('div', { class: 'opt' }, label ? el('span', { class: 'opt-label' }, label) : null, ...controls);
  }
  function optRange(key, min, max, suffix = '') {
    const range = el('input', { type: 'range', class: 'range', min, max, value: settings[key] });
    const num = el('input', { type: 'number', class: 'num', min, max, value: settings[key] });
    const set = (v) => {
      v = clamp(Math.round(+v || min), min, max);
      settings[key] = v;
      range.value = v;
      num.value = v;
      persistSettings();
      requestRender();
    };
    range.addEventListener('input', () => set(range.value));
    num.addEventListener('change', () => set(num.value));
    return [range, num, suffix ? el('span', { class: 'opt-suffix' }, suffix) : null];
  }
  function optSegment(key, options) {
    return el(
      'div',
      { class: 'seg' },
      options.map(([v, label, ic, title]) =>
        el(
          'button',
          {
            class: 'seg-btn' + (settings[key] === v ? ' active' : ''),
            title: title || label,
            onclick: () => {
              settings[key] = v;
              persistSettings();
              refreshOptions();
              requestRender();
            },
          },
          ic ? icon(ic) : null,
          label ? el('span', {}, label) : null
        )
      )
    );
  }
  function optToggle(key, label, ic, title) {
    return el(
      'button',
      {
        class: 'chip' + (settings[key] ? ' active' : ''),
        title: title || label,
        'aria-pressed': String(!!settings[key]),
        onclick: () => toggleSetting(key),
      },
      ic ? icon(ic) : null,
      label ? el('span', {}, label) : null
    );
  }
  function cmdChip(id, label) {
    const c = COMMANDS[id];
    return el('button', { class: 'chip', title: c.label + (c.keys[0] ? ` (${fmtKey(c.keys[0])})` : ''), onclick: () => runCommand(id) }, label || c.label);
  }
  const OPTION_UI = {
    size: () => optGroup('Size', ...optRange('brushSize', 1, 64, 'px')),
    shape: () => optGroup('Shape', optSegment('brushShape', [['square', '', 'brushSquare', 'Square brush'], ['circle', '', 'brushCircle', 'Round brush']])),
    pixelPerfect: () => optToggle('pixelPerfect', 'Pixel-perfect', 'sparkle', 'Removes doubled corners from 1px freehand strokes'),
    symmetry: () =>
      optGroup(
        'Mirror',
        optToggle('symX', '', 'symX', `Horizontal symmetry (${fmtKey('Shift+X')})`),
        optToggle('symY', '', 'symY', `Vertical symmetry (${fmtKey('Shift+Y')})`)
      ),
    fillContiguous: () => optToggle('fillContiguous', 'Contiguous', null, 'Only fill connected pixels (off: replace the color everywhere)'),
    fillTolerance: () => optGroup('Tolerance', ...optRange('fillTolerance', 0, 100, '%')),
    shapeFilled: () => optToggle('shapeFilled', 'Filled', 'fillShape', 'Fill the shape'),
    ditherDensity: () => optGroup('Density', optSegment('ditherDensity', [[0.125, '12%'], [0.25, '25%'], [0.5, '50%'], [0.75, '75%']])),
    shadeMode: () => optGroup('Mode', optSegment('shadeMode', [['light', 'Lightness', null, 'Shift lightness'], ['palette', 'Palette ramp', null, 'Step to the neighbouring palette color']])),
    shadeAmount: () => (settings.shadeMode === 'light' ? optGroup('Step', ...optRange('shadeAmount', 1, 40, '%')) : null),
    gradientMode: () => optGroup('Style', optSegment('gradientMode', [['dither', 'Dithered'], ['smooth', 'Smooth']])),
    sampleMode: () => optGroup('Sample', optSegment('sampleMode', [['composite', 'All layers'], ['layer', 'Current layer']])),
    selMode: () =>
      optGroup(
        'Mode',
        optSegment('selMode', [
          ['replace', '', 'selReplace', 'Replace'],
          ['add', '', 'selAdd', 'Add (Shift)'],
          ['subtract', '', 'selSub', 'Subtract (Alt)'],
          ['intersect', '', 'selInt', 'Intersect (Shift+Alt)'],
        ])
      ),
    wandContiguous: () => optToggle('wandContiguous', 'Contiguous', null, 'Only select connected pixels'),
    wandTolerance: () => optGroup('Tolerance', ...optRange('wandTolerance', 0, 100, '%')),
    selActions: () => optGroup('', cmdChip('selectAll', 'All'), cmdChip('deselect', 'None'), cmdChip('invertSelection', 'Invert')),
    moveHint: () => el('span', { class: 'opt-hint' }, 'Drag to move the selection, or the whole layer when nothing is selected. Arrow keys nudge 1px, Shift+Arrow 8px.'),
    handHint: () => el('span', { class: 'opt-hint' }, 'Tip: hold Space with any tool, or drag with the middle mouse button. Pinch to zoom on touch screens.'),
  };
  function refreshOptions() {
    const d = TOOLS[tool];
    const bar = dom.optionsbar;
    bar.replaceChildren(el('div', { class: 'opt-title' }, icon(d.icon), el('span', {}, d.name)));
    for (const key of d.options) {
      const node = OPTION_UI[key] && OPTION_UI[key]();
      if (node) bar.append(node);
    }
  }

  // --- layers panel -------------------------------------------------------------
  let dragLayerId = null;
  function refreshLayers() {
    if (!sprite) return;
    const list = dom.layerList;
    const items = [];
    for (let i = sprite.layers.length - 1; i >= 0; i--) {
      const layer = sprite.layers[i];
      const meta = [layer.opacity < 100 ? layer.opacity + '%' : '', layer.blend !== 'normal' ? BLEND_LABEL[layer.blend] : ''].filter(Boolean).join(' · ');
      const name = el('span', { class: 'lname' }, layer.name);
      const row = el(
        'div',
        {
          class: 'layer-row' + (layer.id === activeLayerId ? ' active' : '') + (layer.visible ? '' : ' is-hidden'),
          draggable: true,
          dataset: { id: layer.id },
          onclick: () => selectLayer(layer.id),
          ondblclick: () => startRename(layer, name),
        },
        el(
          'button',
          {
            class: 'lbtn',
            title: (layer.visible ? 'Hide layer' : 'Show layer') + ' · Alt+click: solo',
            onclick: (e) => {
              e.stopPropagation();
              toggleLayerVisible(layer.id, e.altKey);
            },
          },
          icon(layer.visible ? 'eye' : 'eyeOff')
        ),
        el(
          'button',
          {
            class: 'lbtn' + (layer.locked ? ' on' : ''),
            title: layer.locked ? 'Unlock layer' : 'Lock layer',
            onclick: (e) => {
              e.stopPropagation();
              toggleLayerLock(layer.id);
            },
          },
          icon(layer.locked ? 'lock' : 'unlock')
        ),
        el('canvas', { class: 'lthumb', width: 64, height: 64, dataset: { lid: layer.id } }),
        el('div', { class: 'ltext' }, name, meta ? el('span', { class: 'lmeta' }, meta) : null)
      );
      row.addEventListener('dragstart', (e) => {
        dragLayerId = layer.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/x-pixeledit-layer', layer.id);
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => {
        dragLayerId = null;
        list.querySelectorAll('.drop-above,.drop-below,.dragging').forEach((n) => n.classList.remove('drop-above', 'drop-below', 'dragging'));
      });
      row.addEventListener('dragover', (e) => {
        if (!dragLayerId) return;
        e.preventDefault();
        const r = row.getBoundingClientRect();
        const above = e.clientY < r.top + r.height / 2;
        row.classList.toggle('drop-above', above);
        row.classList.toggle('drop-below', !above);
      });
      row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below'));
      row.addEventListener('drop', (e) => {
        if (!dragLayerId) return;
        e.preventDefault();
        e.stopPropagation();
        const above = row.classList.contains('drop-above');
        row.classList.remove('drop-above', 'drop-below');
        moveLayerTo(dragLayerId, layer.id, above);
      });
      items.push(row);
    }
    list.replaceChildren(...items);
    const l = activeLayer();
    if (l) {
      dom.layerOpacity.value = l.opacity;
      dom.layerOpacityVal.textContent = l.opacity + '%';
      dom.layerBlend.value = l.blend;
    }
    scheduleThumbs();
  }

  function startRename(layer, nameEl) {
    const input = el('input', { class: 'rename-input', value: layer.name, spellcheck: 'false' });
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save && input.value.trim()) {
        layer.name = input.value.trim().slice(0, 64);
        scheduleAutosave();
      }
      refreshLayers();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
    nameEl.replaceWith(input);
    input.focus();
    input.select();
  }
  function startRenameActive() {
    const row = dom.layerList.querySelector(`.layer-row[data-id="${activeLayerId}"] .lname`);
    const layer = activeLayer();
    if (row && layer) {
      if (!panelsVisible()) togglePanels();
      startRename(layer, row);
    }
  }

  // --- frames strip -------------------------------------------------------------
  let dragFrameIndex = -1;
  function refreshFrames() {
    if (!sprite) return;
    const items = sprite.frames.map((f, i) => {
      const item = el(
        'div',
        {
          class: 'frame' + (i === frameIndex ? ' active' : ''),
          draggable: true,
          dataset: { index: i },
          title: `Frame ${i + 1} · ${f.duration} ms — double-click to set duration`,
          onclick: () => setFrame(i),
          ondblclick: () => frameDurationDialog(i),
        },
        el('canvas', { class: 'fthumb', width: 96, height: 96, dataset: { index: i } }),
        el('div', { class: 'fmeta' }, el('span', { class: 'fnum' }, String(i + 1)), el('span', { class: 'fdur' }, f.duration + 'ms'))
      );
      item.addEventListener('dragstart', (e) => {
        dragFrameIndex = i;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/x-pixeledit-frame', String(i));
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => {
        dragFrameIndex = -1;
        dom.frames.querySelectorAll('.drop-before,.drop-after,.dragging').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'dragging'));
      });
      item.addEventListener('dragover', (e) => {
        if (dragFrameIndex < 0) return;
        e.preventDefault();
        const r = item.getBoundingClientRect();
        const before = e.clientX < r.left + r.width / 2;
        item.classList.toggle('drop-before', before);
        item.classList.toggle('drop-after', !before);
      });
      item.addEventListener('dragleave', () => item.classList.remove('drop-before', 'drop-after'));
      item.addEventListener('drop', (e) => {
        if (dragFrameIndex < 0) return;
        e.preventDefault();
        e.stopPropagation();
        const before = item.classList.contains('drop-before');
        item.classList.remove('drop-before', 'drop-after');
        let to = i + (before ? 0 : 1);
        if (dragFrameIndex < to) to--;
        moveFrameTo(dragFrameIndex, to);
      });
      return item;
    });
    items.push(el('button', { class: 'frame-add', title: `New frame (${fmtKey('Alt+N')})`, onclick: () => addFrame(false) }, icon('plus')));
    dom.frames.replaceChildren(...items);
    refreshTimelineControls();
    scheduleThumbs();
  }
  function updateFrameSelection() {
    dom.frames.querySelectorAll('.frame').forEach((f) => f.classList.toggle('active', +f.dataset.index === frameIndex));
    const active = dom.frames.querySelector('.frame.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function refreshTimelineControls() {
    if (!sprite) return;
    dom.frameCounter.textContent = `${frameIndex + 1} / ${sprite.frames.length}`;
    if (document.activeElement !== dom.frameDuration) dom.frameDuration.value = currentFrame().duration;
    dom.loopMode.value = settings.loopMode;
    dom.btnPlay.replaceChildren(icon(playing ? 'pause' : 'play'));
    dom.btnPlay.classList.toggle('active', playing);
    dom.btnOnion.classList.toggle('active', settings.onion);
    dom.btnOnion.setAttribute('aria-pressed', String(settings.onion));
  }

  // --- thumbnails -----------------------------------------------------------------
  function drawThumb(canvas, src) {
    const ctx = canvas.getContext('2d');
    const cw = canvas.width, ch = canvas.height, W = sprite.width, H = sprite.height;
    ctx.clearRect(0, 0, cw, ch);
    let s = Math.min(cw / W, ch / H);
    if (s >= 1) s = Math.floor(s);
    const dw = Math.max(1, Math.round(W * s)), dh = Math.max(1, Math.round(H * s));
    ctx.imageSmoothingEnabled = s < 1;
    ctx.drawImage(src, Math.floor((cw - dw) / 2), Math.floor((ch - dh) / 2), dw, dh);
  }
  function drawThumbs() {
    if (!sprite) return;
    const W = sprite.width, H = sprite.height, fid = currentFrame().id;
    ensureSize(scratch, W, H);
    dom.layerList.querySelectorAll('canvas.lthumb').forEach((cv) => {
      const cel = getCel(cv.dataset.lid, fid);
      if (!cel) {
        cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
        return;
      }
      scratchCtx.putImageData(toImageData(cel, W, H), 0, 0);
      drawThumb(cv, scratch);
    });
    dom.frames.querySelectorAll('canvas.fthumb').forEach((cv) => {
      const i = +cv.dataset.index;
      if (i < sprite.frames.length) drawThumb(cv, getComposite(i));
    });
  }
  const scheduleThumbs = debounce(drawThumbs, 90);

  // --- status bar -----------------------------------------------------------------
  function refreshCursorStatus() {
    if (!sprite) return;
    const inside = hover && hover.x >= 0 && hover.y >= 0 && hover.x < sprite.width && hover.y < sprite.height;
    dom.stPos.textContent = inside ? `${hover.x}, ${hover.y}` : '–';
    const chip = dom.stColor.firstElementChild, label = dom.stColor.lastElementChild;
    if (inside) {
      const c = sampleAt(hover.x, hover.y);
      chip.style.background = c ? Color.toCss(c) : 'transparent';
      label.textContent = c ? Color.toHex(c) : 'transparent';
      dom.stColor.hidden = false;
    } else dom.stColor.hidden = true;
  }
  function refreshStatus() {
    if (!sprite) return;
    dom.stHint.textContent = TOOLS[tool].hint;
    dom.stSize.textContent = `${sprite.width}×${sprite.height}`;
    dom.stSel.textContent = selection ? `Selection ${selection.w}×${selection.h}` : '';
    dom.stSel.hidden = !selection;
    refreshZoomLabel();
    refreshCursorStatus();
    refreshTimelineControls();
  }
  function refreshHistoryButtons() {
    document.querySelectorAll('[data-cmd="undo"]').forEach((b) => (b.disabled = !hist.undo.length));
    document.querySelectorAll('[data-cmd="redo"]').forEach((b) => (b.disabled = !hist.redo.length));
  }

  // --- layout ---------------------------------------------------------------------
  const narrowQuery = window.matchMedia('(max-width: 900px)');
  const isNarrow = () => narrowQuery.matches;
  function panelsVisible() {
    return isNarrow() ? document.body.classList.contains('panels-open') : !settings.panelsHidden;
  }
  function togglePanels() {
    if (isNarrow()) document.body.classList.toggle('panels-open');
    else {
      settings.panelsHidden = !settings.panelsHidden;
      persistSettings();
    }
    applyLayout();
  }
  function toggleTimeline() {
    settings.timelineHidden = !settings.timelineHidden;
    persistSettings();
    applyLayout();
  }
  function applyLayout() {
    document.body.classList.toggle('panels-hidden', !!settings.panelsHidden);
    document.body.classList.toggle('timeline-hidden', !!settings.timelineHidden);
    document.querySelectorAll('.panel[data-panel]').forEach((p) => p.classList.toggle('collapsed', !!settings.collapsed[p.dataset.panel]));
    requestAnimationFrame(sizePreviewCanvas);
  }

  function refreshAll() {
    refreshToolbar();
    refreshOptions();
    syncPicker();
    refreshPalette();
    refreshRecent();
    refreshLayers();
    refreshFrames();
    refreshStatus();
    refreshHistoryButtons();
    updateCursor();
    requestRender();
  }

  // ===========================================================================
  // Menus & commands
  // ===========================================================================
  const COMMANDS = {};
  function command(id, label, keys, run, extra) {
    COMMANDS[id] = Object.assign({ id, label, keys: keys ? [].concat(keys) : [], run }, extra || {});
  }
  function runCommand(id) {
    const c = COMMANDS[id];
    if (!c || !sprite) return;
    if (c.enabled && !c.enabled()) return;
    c.run();
  }
  const hasSel = () => !!selection;

  command('newSprite', 'New Sprite…', 'Ctrl+Alt+N', newSpriteDialog);
  command('open', 'Open…', 'Ctrl+O', () => openFilePicker('auto'));
  command('importLayer', 'Import Image as Layer…', null, () => openFilePicker('layer'));
  command('saveProject', 'Save Project (.pxl)', 'Ctrl+S', saveProject);
  command('exportPng', 'Export PNG…', 'Ctrl+E', () => exportDialog('png'));
  command('exportSheet', 'Export Spritesheet…', null, () => exportDialog('sheet'));
  command('exportGif', 'Export Animated GIF…', 'Ctrl+Shift+E', () => exportDialog('gif'));

  command('undo', 'Undo', 'Ctrl+Z', undo, { enabled: () => hist.undo.length > 0 });
  command('redo', 'Redo', ['Ctrl+Y', 'Ctrl+Shift+Z'], redo, { enabled: () => hist.redo.length > 0 });
  command('cut', 'Cut', 'Ctrl+X', () => {
    if (copySelection()) deleteContent('Cut');
  });
  command('copy', 'Copy', 'Ctrl+C', () => {
    if (copySelection()) toast(selection ? 'Selection copied' : 'Layer copied', 'ok', 1400);
  });
  command('paste', 'Paste', 'Ctrl+V', () => pasteClip(clipboard), { enabled: () => !!clipboard, noBind: true });
  command('delete', 'Clear', ['Delete', 'Backspace'], () => deleteContent('Clear'));
  command('fillSelection', 'Fill with Primary Color', 'Alt+Backspace', fillSelectionWithPrimary);
  command('flipH', 'Flip Horizontal', 'Shift+H', () => transformContent('flipH'));
  command('flipV', 'Flip Vertical', 'Shift+V', () => transformContent('flipV'));
  command('rotateCW', 'Rotate 90° Clockwise', 'Shift+R', () => transformContent('rotCW'));
  command('rotateCCW', 'Rotate 90° Counter-clockwise', null, () => transformContent('rotCCW'));
  command('rotate180', 'Rotate 180°', null, () => transformContent('rot180'));
  command('swapColors', 'Swap Colors', 'X', swapColors);
  command('resetColors', 'Reset Colors', null, resetColors);
  command('brushSmaller', 'Smaller Brush', '[', () => setBrushSize(settings.brushSize - 1));
  command('brushBigger', 'Bigger Brush', ']', () => setBrushSize(settings.brushSize + 1));

  command('selectAll', 'Select All', 'Ctrl+A', selectAll);
  command('deselect', 'Deselect', 'Ctrl+D', deselect, { enabled: hasSel });
  command('invertSelection', 'Invert Selection', 'Ctrl+Alt+I', invertSelection);
  command('selectOpaque', 'Select Layer Pixels', null, selectOpaque);

  command('adjust', 'Adjust Colors…', 'Ctrl+U', adjustDialog);
  command('invertColors', 'Invert Colors', 'Ctrl+I', () => applyPixelOp('Invert Colors', 'cel', invertColor));
  command('desaturate', 'Desaturate', null, () => applyPixelOp('Desaturate', 'cel', desaturateColor));
  command('outline', 'Outline…', null, outlineDialog);
  command('replaceColor', 'Replace Color…', null, replaceColorDialog);
  command('resizeCanvas', 'Canvas Size…', 'Ctrl+Alt+C', resizeCanvasDialog);
  command('scaleSprite', 'Sprite Size…', null, scaleSpriteDialog);
  command('crop', 'Crop to Selection', null, cropToSelection, { enabled: hasSel });
  command('trim', 'Trim Transparent Edges', null, trimSprite);
  command('spriteFlipH', 'Flip Canvas Horizontally', null, () => transformSprite('flipH'));
  command('spriteFlipV', 'Flip Canvas Vertically', null, () => transformSprite('flipV'));
  command('spriteRotCW', 'Rotate Canvas 90° CW', null, () => transformSprite('rotCW'));
  command('spriteRotCCW', 'Rotate Canvas 90° CCW', null, () => transformSprite('rotCCW'));
  command('spriteRot180', 'Rotate Canvas 180°', null, () => transformSprite('rot180'));

  command('newLayer', 'New Layer', 'Shift+N', addLayer);
  command('duplicateLayer', 'Duplicate Layer', null, duplicateLayer);
  command('deleteLayer', 'Delete Layer', null, deleteLayer, { enabled: () => sprite.layers.length > 1 });
  command('renameLayer', 'Rename Layer', 'F2', startRenameActive);
  command('mergeDown', 'Merge Down', 'Ctrl+M', mergeDown, { enabled: () => activeLayerIndex() > 0 });
  command('flatten', 'Flatten', null, flatten, { enabled: () => sprite.layers.length > 1 });
  command('layerUp', 'Move Layer Up', 'Alt+Up', () => moveLayer(1), { enabled: () => activeLayerIndex() < sprite.layers.length - 1 });
  command('layerDown', 'Move Layer Down', 'Alt+Down', () => moveLayer(-1), { enabled: () => activeLayerIndex() > 0 });
  command('selectLayerAbove', 'Select Layer Above', 'Up', () => stepLayer(1));
  command('selectLayerBelow', 'Select Layer Below', 'Down', () => stepLayer(-1));
  command('toggleLayerVisible', 'Show / Hide Layer', null, () => toggleLayerVisible(activeLayerId));
  command('toggleLayerLock', 'Lock / Unlock Layer', null, () => toggleLayerLock(activeLayerId));

  command('newFrame', 'New Frame', 'Alt+N', () => addFrame(false));
  command('duplicateFrame', 'Duplicate Frame', 'Alt+Shift+N', () => addFrame(true));
  command('deleteFrame', 'Delete Frame', 'Alt+Delete', deleteFrame, { enabled: () => sprite.frames.length > 1 });
  command('frameLeft', 'Move Frame Left', null, () => moveFrame(-1), { enabled: () => frameIndex > 0 });
  command('frameRight', 'Move Frame Right', null, () => moveFrame(1), { enabled: () => frameIndex < sprite.frames.length - 1 });
  command('reverseFrames', 'Reverse Frames', null, reverseFrames, { enabled: () => sprite.frames.length > 1 });
  command('frameDuration', 'Frame Duration…', null, () => frameDurationDialog(frameIndex));
  command('frameRate', 'Set Frame Rate…', null, frameRateDialog);
  command('play', 'Play / Pause', 'Enter', togglePlay, { checked: () => playing });
  command('prevFrame', 'Previous Frame', [',', 'Left'], () => stepFrame(-1));
  command('nextFrame', 'Next Frame', ['.', 'Right'], () => stepFrame(1));
  command('firstFrame', 'First Frame', 'Home', () => setFrame(0));
  command('lastFrame', 'Last Frame', 'End', () => setFrame(sprite.frames.length - 1));
  command('toggleOnion', 'Onion Skin', 'Alt+O', toggleOnion, { checked: () => settings.onion });

  command('zoomIn', 'Zoom In', ['=', '+'], () => stepZoom(1));
  command('zoomOut', 'Zoom Out', '-', () => stepZoom(-1));
  command('zoomFit', 'Fit to Screen', '0', fitView);
  command('zoom100', 'Actual Size', '1', () => zoomTo(1));
  command('toggleGrid', 'Pixel Grid', "Ctrl+'", () => toggleSetting('grid'), { checked: () => settings.grid });
  command('gridSettings', 'Grid Settings…', null, gridSettingsDialog);
  command('toggleTileMode', 'Tile Preview', 'Shift+T', () => toggleSetting('tileMode'), { checked: () => settings.tileMode });
  command(
    'toggleChecker',
    'Light Checkerboard',
    null,
    () => {
      settings.checker = settings.checker === 'light' ? 'dark' : 'light';
      checkerKey = '';
      persistSettings();
      requestRender();
    },
    { checked: () => settings.checker === 'light' }
  );
  command('toggleSymX', 'Horizontal Symmetry', 'Shift+X', () => toggleSetting('symX'), { checked: () => settings.symX });
  command('toggleSymY', 'Vertical Symmetry', 'Shift+Y', () => toggleSetting('symY'), { checked: () => settings.symY });
  command('togglePanels', 'Side Panels', 'Tab', togglePanels, { checked: () => panelsVisible() });
  command('toggleTimeline', 'Timeline', 'Shift+Tab', toggleTimeline, { checked: () => !settings.timelineHidden });

  command('shortcuts', 'Keyboard Shortcuts', '?', shortcutsDialog);
  command('about', 'About Pixeledit', null, aboutDialog);

  const MENU = [
    ['File', ['newSprite', 'open', 'importLayer', '-', 'saveProject', '-', 'exportPng', 'exportSheet', 'exportGif']],
    ['Edit', ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'delete', 'fillSelection', '-', 'flipH', 'flipV', 'rotateCW', 'rotateCCW', 'rotate180', '-', 'swapColors', 'resetColors']],
    ['Select', ['selectAll', 'deselect', 'invertSelection', 'selectOpaque']],
    ['Image', ['adjust', 'invertColors', 'desaturate', 'outline', 'replaceColor', '-', 'resizeCanvas', 'scaleSprite', 'crop', 'trim', '-', 'spriteFlipH', 'spriteFlipV', 'spriteRotCW', 'spriteRotCCW', 'spriteRot180']],
    ['Layer', ['newLayer', 'duplicateLayer', 'deleteLayer', 'renameLayer', '-', 'mergeDown', 'flatten', '-', 'layerUp', 'layerDown', '-', 'toggleLayerVisible', 'toggleLayerLock']],
    ['Frame', ['newFrame', 'duplicateFrame', 'deleteFrame', '-', 'frameLeft', 'frameRight', 'reverseFrames', '-', 'frameDuration', 'frameRate', '-', 'play', 'prevFrame', 'nextFrame', 'firstFrame', 'lastFrame', '-', 'toggleOnion']],
    ['View', ['zoomIn', 'zoomOut', 'zoomFit', 'zoom100', '-', 'toggleGrid', 'gridSettings', 'toggleTileMode', 'toggleChecker', '-', 'toggleSymX', 'toggleSymY', '-', 'togglePanels', 'toggleTimeline']],
    ['Help', ['shortcuts', 'about']],
  ];

  let openMenuState = null;
  function buildMenus() {
    const all = $('#menu-all');
    all.addEventListener('click', (e) => {
      e.stopPropagation();
      if (openMenuState && openMenuState.btn === all) closeMenus();
      else openAllMenus(all);
    });
    MENU.forEach(([label], idx) => {
      const btn = el('button', { class: 'menu-btn', 'aria-haspopup': 'true' }, label);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (openMenuState && openMenuState.index === idx) closeMenus();
        else openMenu(idx, btn);
      });
      btn.addEventListener('pointerenter', () => {
        if (openMenuState && openMenuState.index !== idx && openMenuState.index >= 0) openMenu(idx, btn);
      });
      dom.menus.append(btn);
    });
  }
  function positionDropdown(menu, anchor, alignRight = false) {
    const r = anchor.getBoundingClientRect();
    dom.dropdownRoot.append(menu);
    const mr = menu.getBoundingClientRect();
    let left = alignRight ? r.right - mr.width : r.left;
    left = clamp(left, 8, Math.max(8, window.innerWidth - mr.width - 8));
    let top = r.bottom + 4;
    if (top + mr.height > window.innerHeight - 8) {
      const above = r.top - mr.height - 4;
      if (above >= 8) top = above;
      else menu.style.maxHeight = window.innerHeight - top - 8 + 'px';
    }
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }
  function openMenu(idx, btn) {
    closeMenus();
    const menu = el('div', { class: 'dropdown', role: 'menu' });
    appendMenuItems(menu, MENU[idx][1]);
    positionDropdown(menu, btn);
    btn.classList.add('open');
    openMenuState = { index: idx, el: menu, btn };
  }
  function openAllMenus(btn) {
    closeMenus();
    const menu = el('div', { class: 'dropdown dropdown-all', role: 'menu' });
    for (const [label, ids] of MENU) {
      menu.append(el('div', { class: 'dd-head' }, label));
      appendMenuItems(menu, ids);
    }
    positionDropdown(menu, btn);
    btn.classList.add('open');
    openMenuState = { index: -2, el: menu, btn };
  }
  function appendMenuItems(menu, ids) {
    for (const id of ids) {
      if (id === '-') {
        menu.append(el('div', { class: 'dd-sep' }));
        continue;
      }
      const c = COMMANDS[id];
      const enabled = !c.enabled || c.enabled();
      const checked = c.checked ? c.checked() : false;
      menu.append(
        el(
          'button',
          {
            class: 'dd-item',
            role: 'menuitem',
            disabled: !enabled,
            onclick: () => {
              closeMenus();
              runCommand(id);
            },
          },
          el('span', { class: 'dd-check' }, checked ? icon('check') : null),
          el('span', { class: 'dd-label' }, c.label),
          el('span', { class: 'dd-key' }, c.keys.length ? fmtKey(c.keys[0]) : '')
        )
      );
    }
  }
  function openPopover(anchor, content) {
    closeMenus();
    const pop = el('div', { class: 'dropdown popover' }, content);
    positionDropdown(pop, anchor, true);
    anchor.classList.add('open');
    openMenuState = { index: -1, el: pop, btn: anchor };
  }
  function closeMenus() {
    if (!openMenuState) return;
    openMenuState.el.remove();
    if (openMenuState.btn) openMenuState.btn.classList.remove('open');
    openMenuState = null;
  }

  // ===========================================================================
  // Modals, toasts & form helpers
  // ===========================================================================
  const modalStack = [];
  function openModal({ title, body, buttons = [], width = 440, onCancel }) {
    closeMenus();
    const overlay = el('div', { class: 'modal-overlay' });
    const box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: { width: `min(${width}px, calc(100vw - 24px))` } });
    let closed = false;
    const api = { el: box, primary: null, close, cancel };
    function close() {
      if (closed) return;
      closed = true;
      overlay.remove();
      const i = modalStack.indexOf(api);
      if (i >= 0) modalStack.splice(i, 1);
    }
    function cancel() {
      if (closed) return;
      close();
      if (onCancel) onCancel();
    }
    const foot = el('div', { class: 'modal-foot' });
    for (const b of buttons) {
      const btn = el('button', { class: 'btn ' + (b.kind || '') }, b.label);
      btn.addEventListener('click', () => (b.onClick ? b.onClick(api) : b.cancel ? cancel() : close()));
      if (b.kind && b.kind.includes('primary')) api.primary = btn;
      if (b.left) btn.classList.add('left');
      foot.append(btn);
    }
    box.append(
      el('div', { class: 'modal-head' }, el('h2', {}, title), el('button', { class: 'icon-btn sm', title: 'Close', onclick: cancel }, icon('x'))),
      el('div', { class: 'modal-body' }, body),
      buttons.length ? foot : null
    );
    overlay.append(box);
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) cancel();
    });
    dom.modalRoot.append(overlay);
    modalStack.push(api);
    requestAnimationFrame(() => {
      const f = box.querySelector('input:not([type=range]):not([type=checkbox]):not([type=color]), select');
      if (f && window.matchMedia('(pointer: fine)').matches) {
        f.focus();
        if (f.select) f.select();
      }
    });
    return api;
  }

  function toast(msg, kind = 'info', ms = 2400, key = null) {
    let t = key ? dom.toasts.querySelector(`[data-key="${key}"]`) : null;
    if (t) {
      t.textContent = msg;
      t.className = `toast ${kind} show`;
      clearTimeout(t._timer);
    } else {
      t = el('div', { class: `toast ${kind}`, role: 'status', dataset: key ? { key } : null }, msg);
      dom.toasts.append(t);
      requestAnimationFrame(() => t.classList.add('show'));
    }
    t._timer = setTimeout(() => {
      t.classList.remove('show');
      delete t.dataset.key;
      setTimeout(() => t.remove(), 250);
    }, ms);
    while (dom.toasts.children.length > 3) dom.toasts.firstElementChild.remove();
  }

  const field = (label, control, hint) =>
    el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), control, hint ? el('span', { class: 'field-hint' }, hint) : null);
  const row = (...kids) => el('div', { class: 'field-row' }, ...kids);
  const numInput = (value, min, max, step = 1) => el('input', { type: 'number', class: 'input', value, min, max, step });
  const textInput = (value) => el('input', { type: 'text', class: 'input', value, spellcheck: 'false' });
  function selectInput(options, value) {
    const s = el('select', { class: 'input' }, options.map(([v, l]) => el('option', { value: v }, l)));
    s.value = String(value);
    return s;
  }
  function checkInput(label, checked) {
    const input = el('input', { type: 'checkbox', checked });
    return { input, node: el('label', { class: 'check' }, input, el('span', {}, label)) };
  }
  function segmented(options, value, onChange) {
    const node = el('div', { class: 'seg seg-lg' });
    const api = { node, value };
    for (const [v, label] of options) {
      const b = el('button', { type: 'button', class: 'seg-btn' + (v === value ? ' active' : '') }, label);
      b.addEventListener('click', () => {
        api.value = v;
        node.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
        if (onChange) onChange(v);
      });
      node.append(b);
    }
    return api;
  }
  function sliderRow(label, min, max, value, onInput, fmt = (v) => (v > 0 ? '+' + v : String(v))) {
    const val = el('span', { class: 'slider-val' }, fmt(value));
    const r = el('input', { type: 'range', class: 'range', min, max, value });
    r.addEventListener('input', () => {
      val.textContent = fmt(+r.value);
      onInput(+r.value);
    });
    const node = el('div', { class: 'slider-row' }, el('span', { class: 'slider-label' }, label), r, val);
    node.set = (v) => {
      r.value = v;
      val.textContent = fmt(v);
    };
    return node;
  }
  function colorChip(c) {
    return el('span', { class: 'color-chip', style: { '--c': Color.toCss(c) }, title: c ? Color.toHex(c) : 'transparent' });
  }
  function rafThrottle(fn) {
    let queued = false;
    return () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn();
      });
    };
  }

  // ===========================================================================
  // Dialogs
  // ===========================================================================
  function newSpriteDialog() {
    const name = textInput('untitled');
    const w = numInput(32, 1, MAX_SIZE), h = numInput(32, 1, MAX_SIZE);
    const presets = [[16, 16], [24, 24], [32, 32], [48, 48], [64, 64], [128, 128], [256, 256], [160, 144], [320, 180]];
    const chips = el(
      'div',
      { class: 'chips' },
      presets.map(([pw, ph]) =>
        el(
          'button',
          {
            type: 'button',
            class: 'chip',
            onclick: () => {
              w.value = pw;
              h.value = ph;
            },
          },
          `${pw}×${ph}`
        )
      )
    );
    const bg = selectInput([['transparent', 'Transparent'], ['white', 'White'], ['black', 'Black'], ['primary', 'Primary color']], 'transparent');
    openModal({
      title: 'New Sprite',
      body: el(
        'div',
        {},
        field('Name', name),
        row(field('Width', w), field('Height', h)),
        chips,
        field('Background', bg),
        el('p', { class: 'field-hint' }, 'The current sprite will be replaced. Use File → Save Project first if you want to keep it.')
      ),
      buttons: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Create',
          kind: 'primary',
          onClick: (m) => {
            const W = clamp(Math.round(+w.value) || 32, 1, MAX_SIZE), H = clamp(Math.round(+h.value) || 32, 1, MAX_SIZE);
            const sp = createSprite(W, H, name.value.trim() || 'untitled');
            const fill = { white: Color.pack(255, 255, 255), black: Color.pack(0, 0, 0), primary }[bg.value];
            if (fill) {
              sp.layers[0].name = 'Background';
              sp.cels.set(celKey(sp.layers[0].id, sp.frames[0].id), new Uint32Array(W * H).fill(fill));
            }
            loadSprite(sp);
            m.close();
            toast(`Created ${W}×${H} sprite`, 'ok');
          },
        },
      ],
    });
  }

  function resizeCanvasDialog() {
    const W = sprite.width, H = sprite.height;
    const w = numInput(W, 1, MAX_SIZE), h = numInput(H, 1, MAX_SIZE);
    let anchor = [0.5, 0.5];
    const grid = el('div', { class: 'anchor-grid' });
    for (const ay of [0, 0.5, 1]) {
      for (const ax of [0, 0.5, 1]) {
        const b = el('button', { type: 'button', class: 'anchor' + (ax === 0.5 && ay === 0.5 ? ' active' : ''), title: 'Anchor' });
        b.addEventListener('click', () => {
          anchor = [ax, ay];
          grid.querySelectorAll('.anchor').forEach((x) => x.classList.toggle('active', x === b));
        });
        grid.append(b);
      }
    }
    openModal({
      title: 'Canvas Size',
      body: el('div', {}, el('p', { class: 'field-hint' }, `Current size: ${W}×${H}. Pixels are not scaled — the canvas is cropped or extended.`), row(field('Width', w), field('Height', h)), field('Anchor', grid)),
      buttons: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Resize',
          kind: 'primary',
          onClick: (m) => {
            const nw = clamp(Math.round(+w.value) || W, 1, MAX_SIZE), nh = clamp(Math.round(+h.value) || H, 1, MAX_SIZE);
            m.close();
            if (nw !== W || nh !== H) resizeCanvas(nw, nh, anchor[0], anchor[1]);
          },
        },
      ],
    });
  }

  function scaleSpriteDialog() {
    const W = sprite.width, H = sprite.height;
    const w = numInput(W, 1, MAX_SIZE), h = numInput(H, 1, MAX_SIZE), pct = numInput(100, 1, 10000);
    const lock = checkInput('Keep aspect ratio', true);
    w.addEventListener('input', () => {
      if (lock.input.checked) h.value = Math.max(1, Math.round((+w.value * H) / W));
      pct.value = Math.round((+w.value / W) * 100);
    });
    h.addEventListener('input', () => {
      if (lock.input.checked) w.value = Math.max(1, Math.round((+h.value * W) / H));
      pct.value = Math.round((+h.value / H) * 100);
    });
    pct.addEventListener('input', () => {
      w.value = Math.max(1, Math.round((W * +pct.value) / 100));
      h.value = Math.max(1, Math.round((H * +pct.value) / 100));
    });
    const quick = el(
      'div',
      { class: 'chips' },
      [50, 200, 300, 400].map((p) =>
        el(
          'button',
          {
            type: 'button',
            class: 'chip',
            onclick: () => {
              pct.value = p;
              pct.dispatchEvent(new Event('input'));
            },
          },
          p + '%'
        )
      )
    );
    openModal({
      title: 'Sprite Size',
      body: el('div', {}, el('p', { class: 'field-hint' }, 'Resamples every layer and frame with nearest-neighbour scaling to keep pixels crisp.'), row(field('Width', w), field('Height', h), field('Percent', pct)), quick, lock.node),
      buttons: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Scale',
          kind: 'primary',
          onClick: (m) => {
            const nw = clamp(Math.round(+w.value) || W, 1, MAX_SIZE), nh = clamp(Math.round(+h.value) || H, 1, MAX_SIZE);
            m.close();
            if (nw !== W || nh !== H) scaleSprite(nw, nh);
          },
        },
      ],
    });
  }

  function scopeField(value, onChange) {
    const s = selectInput(SCOPE_OPTIONS, value);
    s.addEventListener('change', () => onChange(s.value));
    return field('Apply to', s, selection ? 'Only pixels inside the selection are affected.' : null);
  }

  function adjustDialog() {
    const st = { hue: 0, sat: 0, light: 0, contrast: 0, scope: 'cel' };
    const lp = livePreview('Adjust Colors');
    const update = rafThrottle(() => {
      const identity = !st.hue && !st.sat && !st.light && !st.contrast;
      lp.run(st.scope, (base, cel, mask) => {
        if (identity) return;
        for (let i = 0; i < base.length; i++) {
          if ((mask && !mask[i]) || !base[i]) continue;
          cel[i] = adjustColor(base[i], st);
        }
      });
    });
    const sliders = [
      sliderRow('Hue', -180, 180, 0, (v) => { st.hue = v; update(); }, (v) => (v > 0 ? '+' : '') + v + '°'),
      sliderRow('Saturation', -100, 100, 0, (v) => { st.sat = v; update(); }),
      sliderRow('Lightness', -100, 100, 0, (v) => { st.light = v; update(); }),
      sliderRow('Contrast', -100, 100, 0, (v) => { st.contrast = v; update(); }),
    ];
    openModal({
      title: 'Adjust Colors',
      width: 460,
      body: el('div', {}, ...sliders, scopeField(st.scope, (v) => { st.scope = v; update(); })),
      onCancel: () => lp.cancel(),
      buttons: [
        {
          label: 'Reset',
          kind: 'ghost',
          left: true,
          onClick: () => {
            st.hue = st.sat = st.light = st.contrast = 0;
            sliders.forEach((s) => s.set(0));
            update();
          },
        },
        { label: 'Cancel', cancel: true },
        {
          label: 'Apply',
          kind: 'primary',
          onClick: (m) => {
            m.close();
            lp.commit();
          },
        },
      ],
    });
  }

  function outlineDialog() {
    const st = { color: primary || Color.pack(0, 0, 0), mode: 'outside', diag: false, scope: 'cel' };
    const lp = livePreview('Outline');
    const update = () => lp.run(st.scope, (base, cel, mask) => outlinePixels(base, cel, mask, st));
    const mode = segmented([['outside', 'Outside'], ['inside', 'Inside']], st.mode, (v) => { st.mode = v; update(); });
    const diag = checkInput('Include diagonals (thicker corners)', false);
    diag.input.addEventListener('change', () => { st.diag = diag.input.checked; update(); });
    openModal({
      title: 'Outline',
      body: el(
        'div',
        {},
        field('Color', el('div', { class: 'inline' }, colorChip(st.color), el('span', { class: 'muted' }, 'Uses the primary color'))),
        field('Placement', mode.node),
        diag.node,
        scopeField(st.scope, (v) => { st.scope = v; update(); })
      ),
      onCancel: () => lp.cancel(),
      buttons: [
        { label: 'Cancel', cancel: true },
        { label: 'Apply', kind: 'primary', onClick: (m) => { m.close(); lp.commit(); } },
      ],
    });
    update();
  }

  function replaceColorDialog() {
    const st = { from: primary, to: secondary, tol: 0, scope: 'cel' };
    const lp = livePreview('Replace Color');
    const update = rafThrottle(() =>
      lp.run(st.scope, (base, cel, mask) => {
        const tol = Math.round(st.tol * 2.55);
        for (let i = 0; i < base.length; i++) {
          if (mask && !mask[i]) continue;
          if (tol ? Color.dist(base[i], st.from) <= tol : Color.same(base[i], st.from)) cel[i] = st.to;
        }
      })
    );
    const chips = el('div', { class: 'inline' });
    const drawChips = () => chips.replaceChildren(colorChip(st.from), icon('arrowRight', 'muted'), colorChip(st.to));
    drawChips();
    const swap = el('button', { type: 'button', class: 'chip', onclick: () => { [st.from, st.to] = [st.to, st.from]; drawChips(); update(); } }, icon('swap'), el('span', {}, 'Swap'));
    openModal({
      title: 'Replace Color',
      body: el(
        'div',
        {},
        field('Primary → secondary', el('div', { class: 'inline' }, chips, swap), 'Pick the two colors in the color panel before opening this dialog.'),
        sliderRow('Tolerance', 0, 100, 0, (v) => { st.tol = v; update(); }, (v) => v + '%'),
        scopeField(st.scope, (v) => { st.scope = v; update(); })
      ),
      onCancel: () => lp.cancel(),
      buttons: [
        { label: 'Cancel', cancel: true },
        { label: 'Replace', kind: 'primary', onClick: (m) => { m.close(); lp.commit(); } },
      ],
    });
    update();
  }

  function gridSettingsDialog() {
    const grid = checkInput('Show pixel grid when zoomed in', settings.grid);
    const minZoom = selectInput([[4, '400%'], [6, '600%'], [8, '800%'], [12, '1200%'], [16, '1600%']], settings.gridMinZoom);
    const tile = numInput(settings.tileGrid || 0, 0, 512);
    const checker = selectInput([['dark', 'Dark'], ['light', 'Light']], settings.checker);
    const apply = () => {
      settings.grid = grid.input.checked;
      settings.gridMinZoom = +minZoom.value;
      settings.tileGrid = clamp(Math.round(+tile.value) || 0, 0, 512);
      settings.checker = checker.value;
      checkerKey = '';
      persistSettings();
      requestRender();
    };
    [grid.input, minZoom, tile, checker].forEach((n) => n.addEventListener('input', apply));
    const tiles = el(
      'div',
      { class: 'chips' },
      [0, 8, 16, 32].map((n) => el('button', { type: 'button', class: 'chip', onclick: () => { tile.value = n; apply(); } }, n ? `${n}×${n}` : 'Off'))
    );
    openModal({
      title: 'Grid Settings',
      body: el('div', {}, grid.node, field('Show pixel grid from', minZoom), field('Tile grid size (0 = off)', tile, 'Draws a second grid every N pixels — handy for tilesets and spritesheets.'), tiles, field('Transparency checkerboard', checker)),
      buttons: [{ label: 'Done', kind: 'primary', onClick: (m) => { apply(); m.close(); } }],
    });
  }

  function frameDurationDialog(i = frameIndex) {
    const f = sprite.frames[i];
    if (!f) return;
    const ms = numInput(f.duration, 10, 10000, 10);
    const fps = el('span', { class: 'muted' });
    const upd = () => (fps.textContent = `≈ ${(1000 / clamp(+ms.value || 100, 10, 10000)).toFixed(1)} fps`);
    ms.addEventListener('input', upd);
    upd();
    const all = checkInput('Apply to all frames', false);
    openModal({
      title: `Frame ${i + 1} Duration`,
      width: 360,
      body: el('div', {}, field('Duration (ms)', el('div', { class: 'inline' }, ms, fps)), all.node),
      buttons: [
        { label: 'Cancel', cancel: true },
        {
          label: 'OK',
          kind: 'primary',
          onClick: (m) => {
            const d = clamp(Math.round(+ms.value) || 100, 10, 10000);
            if (all.input.checked) sprite.frames.forEach((fr) => (fr.duration = d));
            else f.duration = d;
            m.close();
            refreshFrames();
            scheduleAutosave();
          },
        },
      ],
    });
  }

  function frameRateDialog() {
    const cur = Math.round(1000 / currentFrame().duration);
    const fps = numInput(cur, 1, 100);
    openModal({
      title: 'Frame Rate',
      width: 360,
      body: el('div', {}, field('Frames per second', fps, 'Sets the same duration on every frame.')),
      buttons: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Apply',
          kind: 'primary',
          onClick: (m) => {
            const d = clamp(Math.round(1000 / clamp(+fps.value || 10, 1, 100)), 10, 10000);
            sprite.frames.forEach((f) => (f.duration = d));
            m.close();
            refreshFrames();
            scheduleAutosave();
          },
        },
      ],
    });
  }

  function openOnionSettings() {
    const mk = (label, key, min, max, suffix = '') => {
      const inp = el('input', { type: 'range', class: 'range', min, max, value: settings[key] });
      const val = el('span', { class: 'slider-val' }, settings[key] + suffix);
      inp.addEventListener('input', () => {
        settings[key] = +inp.value;
        val.textContent = inp.value + suffix;
        persistSettings();
        requestRender();
      });
      return el('div', { class: 'slider-row' }, el('span', { class: 'slider-label' }, label), inp, val);
    };
    const tint = checkInput('Tint (red = before, blue = after)', settings.onionTint);
    tint.input.addEventListener('change', () => {
      settings.onionTint = tint.input.checked;
      persistSettings();
      requestRender();
    });
    const flag = (label, key) => {
      const ci = checkInput(label, settings[key]);
      ci.input.addEventListener('change', () => {
        settings[key] = ci.input.checked;
        persistSettings();
        requestRender();
      });
      return ci.node;
    };
    const on = checkInput('Enabled', settings.onion);
    on.input.addEventListener('change', () => {
      if (on.input.checked !== settings.onion) toggleOnion();
    });
    openPopover(
      dom.btnOnionSettings,
      el('div', { class: 'pop-body' }, el('div', { class: 'pop-title' }, 'Onion skin'), on.node, mk('Before', 'onionPrev', 0, 5), mk('After', 'onionNext', 0, 5), mk('Opacity', 'onionOpacity', 5, 90, '%'), tint.node, flag('Current layer only', 'onionLayerOnly'), flag('Show in front of the frame', 'onionFront'))
    );
  }

  function shortcutsDialog() {
    const groups = [
      ['Tools', Object.values(TOOLS).map((t) => [t.name, t.key])],
      [
        'Painting',
        [
          ['Pick color (with any brush)', 'Alt'],
          ['Pan', 'Space'],
          ['Draw with secondary color', 'Right click'],
          ['Straight line from last point', 'Shift+Click'],
          ['Brush size', '[ / ]'],
          ['Swap colors', 'X'],
        ],
      ],
    ];
    for (const [menu, ids] of MENU) {
      const list = ids.filter((id) => id !== '-' && COMMANDS[id].keys.length).map((id) => [COMMANDS[id].label, COMMANDS[id].keys.join(' / ')]);
      if (list.length) groups.push([menu, list]);
    }
    const body = el(
      'div',
      { class: 'shortcut-grid' },
      groups.map(([title, list]) =>
        el(
          'section',
          {},
          el('h3', {}, title),
          el('dl', {}, list.map(([label, key]) => [el('dt', {}, label), el('dd', {}, key.split(' / ').map((k) => el('kbd', {}, fmtKey(k))))]))
        )
      )
    );
    openModal({ title: 'Keyboard Shortcuts', body, width: 820, buttons: [{ label: 'Close', kind: 'primary', cancel: true }] });
  }

  function aboutDialog() {
    openModal({
      title: 'About Pixeledit',
      width: 420,
      body: el(
        'div',
        { class: 'about' },
        el('div', { class: 'about-logo brand-logo' }),
        el('p', {}, el('strong', {}, 'Pixeledit'), ' — a pixel art & sprite animation studio that runs entirely in your browser.'),
        el('p', { class: 'muted' }, 'Layers with blend modes, frame animation with onion skinning, dithering, symmetry, selections, palettes and GIF / spritesheet export. Your work is autosaved locally in this browser.'),
        el('p', {}, el('a', { href: 'https://github.com/adityajhagaming123-droid/pixel-editor', target: '_blank', rel: 'noopener' }, 'Source on GitHub'))
      ),
      buttons: [{ label: 'Close', kind: 'primary', cancel: true }],
    });
  }

  // ===========================================================================
  // Files: project save/load, autosave, image import
  // ===========================================================================
  function serialize() {
    const cels = [];
    for (const [k, buf] of sprite.cels) {
      if (isEmptyBuffer(buf)) continue;
      const [l, f] = k.split('|');
      cels.push({ layer: l, frame: f, data: Codec.encodePixels(buf) });
    }
    return {
      format: 'pixeledit',
      version: 2,
      name: sprite.name,
      width: sprite.width,
      height: sprite.height,
      layers: sprite.layers.map(({ id, name, visible, locked, opacity, blend }) => ({ id, name, visible, locked, opacity, blend })),
      frames: sprite.frames.map(({ id, duration }) => ({ id, duration })),
      cels,
      activeLayerId,
      frameIndex,
      colors: { primary: Color.toHex(primary), secondary: Color.toHex(secondary) },
      palette: { name: palette.name, colors: palette.colors.map((c) => Color.toHex(c)) },
    };
  }

  function deserialize(o) {
    if (!o || o.format !== 'pixeledit') throw new Error('This is not a Pixeledit project file');
    const W = Math.round(+o.width), H = Math.round(+o.height);
    if (!(W >= 1 && H >= 1 && W <= MAX_SIZE && H <= MAX_SIZE)) throw new Error('Invalid sprite size in project file');
    const layers = (Array.isArray(o.layers) ? o.layers : []).map((l) => ({
      id: String(l.id || uid('L')),
      name: String(l.name || 'Layer').slice(0, 64),
      visible: l.visible !== false,
      locked: !!l.locked,
      opacity: clamp(Math.round(+l.opacity), 0, 100) || (l.opacity === 0 ? 0 : 100),
      blend: BLEND_OP[l.blend] ? l.blend : 'normal',
    }));
    const frames = (Array.isArray(o.frames) ? o.frames : []).map((f) => ({ id: String(f.id || uid('F')), duration: clamp(Math.round(+f.duration) || 100, 10, 10000) }));
    const sp = { name: String(o.name || 'untitled').slice(0, 80), width: W, height: H, layers, frames, cels: new Map() };
    if (!layers.length) layers.push(makeLayer('Layer 1'));
    if (!frames.length) frames.push(makeFrame());
    const lids = new Set(layers.map((l) => l.id)), fids = new Set(frames.map((f) => f.id));
    for (const c of Array.isArray(o.cels) ? o.cels : []) {
      if (lids.has(c.layer) && fids.has(c.frame) && typeof c.data === 'string') sp.cels.set(celKey(c.layer, c.frame), Codec.decodePixels(c.data, W * H));
    }
    return sp;
  }

  function loadSprite(sp, meta = {}) {
    stopPlayback();
    stopPreview();
    closeMenus();
    sprite = sp;
    compCache.clear();
    frameStamps.clear();
    structStamp++;
    activeLayerId = sp.layers.some((l) => l.id === meta.activeLayerId) ? meta.activeLayerId : sp.layers[sp.layers.length - 1].id;
    frameIndex = clamp(meta.frameIndex | 0, 0, sp.frames.length - 1);
    selection = null;
    moveSession = null;
    lastPaint = null;
    S = null;
    drag = null;
    resetHistory();
    dom.docName.value = sp.name;
    document.title = `${sp.name} — Pixeledit`;
    fitView();
    refreshAll();
    scheduleAutosave();
  }

  let autosaveWarned = false;
  function autosaveNow() {
    if (!sprite || tx) return;
    const ok = writeJSON(KEYS.autosave, serialize());
    dom.stSave.textContent = ok ? 'Saved in browser' : 'Autosave failed';
    dom.stSave.classList.toggle('bad', !ok);
    if (!ok && !autosaveWarned) {
      autosaveWarned = true;
      toast('Autosave failed — the project is too big for browser storage. Use File → Save Project.', 'warn', 6000);
    }
  }
  const scheduleAutosave = debounce(autosaveNow, 700);

  function saveProject() {
    const blob = new Blob([JSON.stringify(serialize())], { type: 'application/json' });
    downloadBlob(blob, safeFileName(sprite.name) + '.pxl');
    toast('Project saved', 'ok');
  }

  let openMode = 'auto';
  function openFilePicker(mode) {
    openMode = mode;
    dom.fileOpen.accept = mode === 'layer' ? 'image/*' : '.pxl,.json,image/*';
    dom.fileOpen.click();
  }

  async function imageFileToPixels(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('Could not read that image'));
        i.src = url;
      });
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) throw new Error('That image is empty');
      if (w * h > 16e6) throw new Error(`That image is too large (${w}×${h})`);
      const cv = el('canvas', { width: w, height: h });
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return { w, h, px: readPixels(ctx, w, h), name: file.name.replace(/\.[^.]+$/, '') };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Detects images that are pixel art upscaled by an integer factor. */
  function detectUpscale(img) {
    const { w, h, px } = img;
    for (let f = Math.min(64, w, h); f >= 2; f--) {
      if (w % f || h % f) continue;
      let ok = true;
      for (let y = 0; y < h && ok; y++) {
        const sy = y - (y % f);
        for (let x = 0; x < w; x++) {
          if (px[y * w + x] !== px[sy * w + (x - (x % f))]) {
            ok = false;
            break;
          }
        }
      }
      if (ok) return f;
    }
    return 1;
  }
  function downscale(img, f) {
    const w = img.w / f, h = img.h / f, px = new Uint32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = img.px[y * f * img.w + x * f];
    return { ...img, w, h, px };
  }

  async function openFile(file, mode = 'auto') {
    try {
      if (/\.(pxl|json)$/i.test(file.name) || file.type === 'application/json') {
        if (mode === 'layer') throw new Error('Choose an image to import as a layer');
        const o = JSON.parse(await file.text());
        const sp = deserialize(o);
        loadSprite(sp, o);
        if (o.palette && Array.isArray(o.palette.colors)) setPalette(String(o.palette.name || 'Project'), o.palette.colors.map(Color.fromHex).filter((c) => c !== null));
        toast(`Opened ${sp.name}`, 'ok');
      } else if (file.type.startsWith('image/') || /\.(png|gif|jpe?g|webp|bmp)$/i.test(file.name)) {
        const img = await imageFileToPixels(file);
        if (mode === 'layer') importAsLayer(img);
        else importImageDialog(img);
      } else throw new Error('Unsupported file type');
    } catch (err) {
      toast(err.message || 'Could not open file', 'error', 4000);
    }
  }

  function importAsLayer(img) {
    stopPlayback();
    const W = sprite.width, H = sprite.height;
    begin('Import Layer');
    const layer = makeLayer(img.name || 'Imported');
    const cel = new Uint32Array(W * H);
    for (let y = 0; y < Math.min(H, img.h); y++) for (let x = 0; x < Math.min(W, img.w); x++) cel[y * W + x] = img.px[y * img.w + x];
    sprite.cels.set(celKey(layer.id, currentFrame().id), cel);
    sprite.layers.splice(activeLayerIndex() + 1, 0, layer);
    activeLayerId = layer.id;
    commit();
    toast(img.w > W || img.h > H ? 'Imported — the image was larger than the canvas and was cropped' : 'Image imported as a new layer', img.w > W || img.h > H ? 'warn' : 'ok', 3500);
  }

  function importImageDialog(orig) {
    let img = orig;
    const factor = detectUpscale(orig);
    const down = checkInput(`Detected ${factor}× upscaled pixel art — import at 1×`, factor > 1);
    const guess = img.w > img.h && img.w % img.h === 0 ? [img.h, img.h] : img.h > img.w && img.h % img.w === 0 ? [img.w, img.w] : [img.w, img.h];
    const fw = numInput(guess[0], 1, MAX_SIZE), fh = numInput(guess[1], 1, MAX_SIZE);
    const skip = checkInput('Skip empty frames', true);
    const sheetRow = el('div', {}, row(field('Frame width', fw), field('Frame height', fh)), skip.node);
    const info = el('p', { class: 'field-hint' });
    const mode = segmented([['sprite', 'New sprite'], ['layer', 'New layer'], ['sheet', 'Spritesheet → frames']], 'sprite', () => update());
    const cur = () => (down.input.checked && factor > 1 ? downscale(orig, factor) : orig);
    function update() {
      img = cur();
      sheetRow.hidden = mode.value !== 'sheet';
      const tooBig = img.w > MAX_SIZE || img.h > MAX_SIZE;
      if (mode.value === 'sheet') {
        const cols = Math.floor(img.w / Math.max(1, +fw.value)), rows = Math.floor(img.h / Math.max(1, +fh.value));
        info.textContent = `${img.w}×${img.h} image → up to ${cols * rows} frames of ${fw.value}×${fh.value}`;
      } else if (mode.value === 'layer') info.textContent = `${img.w}×${img.h} image → new layer in the current ${sprite.width}×${sprite.height} sprite`;
      else info.textContent = tooBig ? `${img.w}×${img.h} is larger than the ${MAX_SIZE}×${MAX_SIZE} limit` : `Opens a new ${img.w}×${img.h} sprite`;
    }
    [fw, fh].forEach((n) => n.addEventListener('input', update));
    down.input.addEventListener('change', () => {
      img = cur();
      const g = img.w > img.h && img.w % img.h === 0 ? [img.h, img.h] : [img.w, img.h];
      fw.value = g[0];
      fh.value = g[1];
      update();
    });
    update();
    openModal({
      title: 'Import Image',
      width: 480,
      body: el('div', {}, field('Open as', mode.node), factor > 1 ? down.node : null, sheetRow, info),
      buttons: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Import',
          kind: 'primary',
          onClick: (m) => {
            img = cur();
            if (mode.value === 'layer') {
              m.close();
              importAsLayer(img);
              return;
            }
            if (mode.value === 'sheet') {
              const w = clamp(Math.round(+fw.value) || img.w, 1, MAX_SIZE), h = clamp(Math.round(+fh.value) || img.h, 1, MAX_SIZE);
              const sp = sliceSheet(img, w, h, skip.input.checked);
              if (!sp) {
                toast('No frames found with that frame size', 'error');
                return;
              }
              m.close();
              loadSprite(sp);
              toast(`Imported ${sp.frames.length} frames`, 'ok');
              return;
            }
            if (img.w > MAX_SIZE || img.h > MAX_SIZE) {
              toast(`Images up to ${MAX_SIZE}×${MAX_SIZE} are supported`, 'error');
              return;
            }
            const sp = createSprite(img.w, img.h, img.name || 'image');
            sp.cels.set(celKey(sp.layers[0].id, sp.frames[0].id), img.px.slice());
            m.close();
            loadSprite(sp);
            toast(`Opened ${img.w}×${img.h} image`, 'ok');
          },
        },
      ],
    });
  }

  function sliceSheet(img, fw, fh, skipEmpty) {
    const cols = Math.floor(img.w / fw), rows = Math.floor(img.h / fh);
    if (!cols || !rows) return null;
    const sp = createSprite(fw, fh, img.name || 'spritesheet');
    const layer = sp.layers[0];
    sp.frames = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = new Uint32Array(fw * fh);
        for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) px[y * fw + x] = img.px[(r * fh + y) * img.w + c * fw + x];
        if (skipEmpty && isEmptyBuffer(px)) continue;
        const f = makeFrame(100);
        sp.frames.push(f);
        sp.cels.set(celKey(layer.id, f.id), px);
      }
    }
    if (!sp.frames.length) return null;
    return sp;
  }

  // ===========================================================================
  // Export
  // ===========================================================================
  function exportDialog(format = 'png') {
    stopPlayback();
    const st = { format, scale: settings.exportScale || 4, layout: 'horizontal', cols: Math.ceil(Math.sqrt(sprite.frames.length)), bg: 'transparent', bgColor: '#ffffff' };
    const fmt = segmented([['png', 'PNG image'], ['sheet', 'Spritesheet'], ['gif', 'Animated GIF']], st.format, (v) => { st.format = v; update(); });
    const scale = selectInput([1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32].map((s) => [s, s + '×']), st.scale);
    const layout = selectInput([['horizontal', 'Horizontal strip'], ['vertical', 'Vertical strip'], ['grid', 'Grid']], st.layout);
    const cols = numInput(st.cols, 1, 256);
    const bg = selectInput([['transparent', 'Transparent'], ['color', 'Solid color']], st.bg);
    const bgColor = el('input', { type: 'color', class: 'input color-input', value: st.bgColor });
    const name = textInput(safeFileName(sprite.name));
    const info = el('div', { class: 'export-info' });
    const colsField = field('Columns', cols);
    const sheetRow = row(field('Layout', layout), colsField);
    const bgColorField = field('Color', bgColor);
    const gifRow = row(field('Background', bg), bgColorField);
    function dims() {
      const W = sprite.width * st.scale, H = sprite.height * st.scale, n = sprite.frames.length;
      if (st.format === 'sheet') {
        const c = st.layout === 'horizontal' ? n : st.layout === 'vertical' ? 1 : Math.min(st.cols, n);
        return [W * c, H * Math.ceil(n / c)];
      }
      return [W, H];
    }
    function update() {
      st.scale = +scale.value;
      st.layout = layout.value;
      st.cols = clamp(Math.round(+cols.value) || 1, 1, 256);
      st.bg = bg.value;
      st.bgColor = bgColor.value;
      sheetRow.hidden = st.format !== 'sheet';
      colsField.hidden = st.layout !== 'grid';
      gifRow.hidden = st.format !== 'gif';
      bgColorField.hidden = st.bg !== 'color';
      const [w, h] = dims();
      const n = sprite.frames.length;
      const what = st.format === 'png' ? `frame ${frameIndex + 1}` : `${n} frame${n > 1 ? 's' : ''}`;
      const big = w > 16384 || h > 16384 || w * h > 100e6;
      info.replaceChildren(icon('info'), el('span', {}, `${w}×${h} px · ${what}`), ...(big ? [el('strong', { class: 'warn-text' }, '— too large, lower the scale')] : []));
    }
    [scale, layout, cols, bg, bgColor].forEach((n) => n.addEventListener('input', update));
    openModal({
      title: 'Export',
      width: 500,
      body: el('div', {}, field('Format', fmt.node), field('Scale', scale), sheetRow, gifRow, field('File name', name), info),
      buttons: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Export',
          kind: 'primary',
          onClick: async (m) => {
            update();
            const [w, h] = dims();
            if (w > 16384 || h > 16384 || w * h > 100e6) {
              toast('That export is too large — lower the scale or use a grid layout', 'error', 4000);
              return;
            }
            settings.exportScale = st.scale;
            persistSettings();
            m.close();
            try {
              await doExport(st, safeFileName(name.value, 'sprite'));
            } catch (err) {
              toast(err.message || 'Export failed', 'error', 4000);
            }
          },
        },
      ],
    });
    update();
  }

  function canvasToBlob(cv) {
    return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode image — try a smaller scale'))), 'image/png'));
  }
  function upscalePixels(px, W, H, s) {
    if (s === 1) return px;
    const ow = W * s, out = new Uint32Array(ow * H * s), rowBuf = new Uint32Array(ow);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) rowBuf.fill(px[y * W + x], x * s, x * s + s);
      for (let k = 0; k < s; k++) out.set(rowBuf, (y * s + k) * ow);
    }
    return out;
  }
  function flattenOnto(px, bgHex) {
    const bgc = Color.unpack(Color.fromHex(bgHex) || 0xffffffff);
    const out = new Uint32Array(px.length);
    for (let i = 0; i < px.length; i++) {
      const { r, g, b, a } = Color.unpack(px[i]);
      const t = a / 255;
      out[i] = Color.pack(Math.round(r * t + bgc.r * (1 - t)), Math.round(g * t + bgc.g * (1 - t)), Math.round(b * t + bgc.b * (1 - t)), 255);
    }
    return out;
  }

  async function doExport(st, base) {
    const W = sprite.width, H = sprite.height, s = st.scale, n = sprite.frames.length;
    if (st.format === 'png') {
      const cv = el('canvas', { width: W * s, height: H * s });
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(getComposite(frameIndex), 0, 0, W * s, H * s);
      downloadBlob(await canvasToBlob(cv), `${base}.png`);
      toast(`Exported ${base}.png`, 'ok');
    } else if (st.format === 'sheet') {
      const cols = st.layout === 'horizontal' ? n : st.layout === 'vertical' ? 1 : Math.min(st.cols, n);
      const rows = Math.ceil(n / cols);
      const cv = el('canvas', { width: W * s * cols, height: H * s * rows });
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      for (let i = 0; i < n; i++) ctx.drawImage(getComposite(i), (i % cols) * W * s, Math.floor(i / cols) * H * s, W * s, H * s);
      downloadBlob(await canvasToBlob(cv), `${base}-sheet.png`);
      toast(`Exported ${n}-frame spritesheet`, 'ok');
    } else {
      toast('Encoding GIF…', 'info', 1200);
      await new Promise((r) => setTimeout(r, 30));
      const frames = sprite.frames.map((f, i) => {
        let px = compositePixels(i);
        if (st.bg === 'color') px = flattenOnto(px, st.bgColor);
        return { data: upscalePixels(px, W, H, s), delay: f.duration };
      });
      const bytes = GifEncoder.encode({ width: W * s, height: H * s, frames, transparent: st.bg !== 'color', loop: true });
      downloadBlob(new Blob([bytes], { type: 'image/gif' }), `${base}.gif`);
      toast(`Exported ${base}.gif (${(bytes.length / 1024).toFixed(1)} KB)`, 'ok');
    }
  }

  // ===========================================================================
  // Static UI wiring
  // ===========================================================================
  function dragControl(target, onPos) {
    target.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      target.setPointerCapture(e.pointerId);
      const upd = (ev) => {
        const r = target.getBoundingClientRect();
        onPos(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1));
      };
      upd(e);
      const move = (ev) => upd(ev);
      const up = () => {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        target.removeEventListener('pointercancel', up);
      };
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', up);
    });
  }

  function wireUI() {
    // Canvas input
    const v = dom.view;
    v.addEventListener('pointerdown', onPointerDown);
    v.addEventListener('pointermove', onPointerMove);
    v.addEventListener('pointerup', onPointerUp);
    v.addEventListener('pointercancel', onPointerCancel);
    v.addEventListener('lostpointercapture', (e) => {
      if (drag && drag.id === e.pointerId) onPointerUp(e);
    });
    v.addEventListener('pointerleave', () => {
      if (!drag) setHover(null);
    });
    v.addEventListener('contextmenu', (e) => e.preventDefault());
    v.addEventListener('dblclick', (e) => {
      if (tool === 'hand') fitView();
      e.preventDefault();
    });
    dom.workspace.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => {
      altDown = spaceDown = false;
      clipboardFresh = false;
      updateCursor();
    });
    new ResizeObserver(resizeView).observe(dom.workspace);
    narrowQuery.addEventListener('change', () => {
      document.body.classList.remove('panels-open');
      applyLayout();
    });

    // Generic command buttons
    document.querySelectorAll('[data-cmd]').forEach((b) => {
      const c = COMMANDS[b.dataset.cmd];
      if (c && !b.title) b.title = c.label + (c.keys.length ? ` (${fmtKey(c.keys[0])})` : '');
      b.addEventListener('click', () => {
        runCommand(b.dataset.cmd);
        b.blur();
      });
    });

    // Panel controls hand focus back to the canvas so shortcuts keep working
    document.addEventListener('change', (e) => {
      const t = e.target;
      if ((t.tagName === 'SELECT' || NON_TEXT_INPUTS.has(t.type)) && !t.closest('.modal, .dropdown')) t.blur();
    });

    // Menus & popovers close on outside click
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (openMenuState && !openMenuState.el.contains(e.target) && !(openMenuState.btn && openMenuState.btn.contains(e.target))) closeMenus();
      },
      true
    );
    window.addEventListener('resize', closeMenus);

    // Document name
    dom.docName.addEventListener('change', () => {
      sprite.name = dom.docName.value.trim() || 'untitled';
      dom.docName.value = sprite.name;
      document.title = `${sprite.name} — Pixeledit`;
      scheduleAutosave();
    });

    // Collapsible panels
    document.querySelectorAll('.panel[data-panel] > .panel-head').forEach((head) => {
      head.addEventListener('click', () => {
        const p = head.parentElement;
        p.classList.toggle('collapsed');
        settings.collapsed[p.dataset.panel] = p.classList.contains('collapsed');
        persistSettings();
        requestAnimationFrame(() => {
          sizePreviewCanvas();
          drawPreview();
        });
      });
    });

    // Color picker
    dom.swPrimary.addEventListener('click', () => setPickerTarget('primary'));
    dom.swSecondary.addEventListener('click', () => setPickerTarget('secondary'));
    dragControl(dom.sv, (x, y) => {
      picker.s = x;
      picker.v = 1 - y;
      if (picker.a === 0) picker.a = 255;
      applyPicker();
    });
    dragControl(dom.hueBar, (x) => {
      picker.h = Math.min(359.9, x * 360);
      if (picker.a === 0) picker.a = 255;
      if (picker.s === 0) picker.s = 1;
      if (picker.v === 0) picker.v = 1;
      applyPicker();
    });
    dragControl(dom.alphaBar, (x) => {
      picker.a = Math.round(x * 255);
      applyPicker();
    });
    const hexCommit = () => {
      const s = dom.hexInput.value.trim();
      const c = /^transparent$/i.test(s) ? 0 : Color.fromHex(s);
      if (c !== null) setColor(picker.target, c);
      else refreshColors();
    };
    dom.hexInput.addEventListener('change', hexCommit);
    dom.hexInput.addEventListener('input', () => {
      const s = dom.hexInput.value.trim().replace(/^#/, '');
      if (/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) {
        const c = Color.fromHex(s);
        if (picker.target === 'primary') primary = c;
        else secondary = c;
        syncPicker();
        const saved = document.activeElement;
        refreshColors();
        if (saved) saved.focus();
      }
    });
    [dom.inR, dom.inG, dom.inB, dom.inA].forEach((inp) =>
      inp.addEventListener('change', () => {
        const val = (n) => clamp(Math.round(+n.value) || 0, 0, 255);
        setColor(picker.target, Color.pack(val(dom.inR), val(dom.inG), val(dom.inB), val(dom.inA)));
      })
    );

    // Palette
    dom.paletteSelect.addEventListener('change', () => {
      const p = PALETTES.find((x) => x.name === dom.paletteSelect.value);
      if (p) setPalette(p.name, p.colors.map(Color.fromHex));
    });
    dom.paletteGrid.addEventListener('click', (e) => {
      const sw = e.target.closest('.pal-swatch');
      if (!sw) return;
      paletteSel = +sw.dataset.i;
      setColor('primary', palette.colors[paletteSel]);
      dom.paletteGrid.querySelectorAll('.pal-swatch').forEach((n) => n.classList.toggle('selected', n === sw));
    });
    dom.paletteGrid.addEventListener('contextmenu', (e) => {
      const sw = e.target.closest('.pal-swatch');
      if (!sw) return;
      e.preventDefault();
      setColor('secondary', palette.colors[+sw.dataset.i]);
    });
    $('#pal-add').addEventListener('click', () => {
      if (palette.colors.includes(primary)) {
        toast('That color is already in the palette');
        return;
      }
      if (!primary) {
        toast('Transparent can’t be added to a palette', 'warn');
        return;
      }
      palette.colors.push(primary);
      paletteSel = palette.colors.length - 1;
      paletteModified();
    });
    $('#pal-remove').addEventListener('click', () => {
      if (paletteSel < 0 || paletteSel >= palette.colors.length) {
        toast('Click a swatch first, then remove it');
        return;
      }
      palette.colors.splice(paletteSel, 1);
      paletteSel = Math.min(paletteSel, palette.colors.length - 1);
      paletteModified();
    });
    $('#pal-extract').addEventListener('click', extractPalette);
    $('#pal-sort').addEventListener('click', () => {
      palette.colors = sortColors(palette.colors);
      paletteSel = -1;
      paletteModified();
    });
    $('#pal-import').addEventListener('click', () => dom.filePalette.click());
    $('#pal-export').addEventListener('click', exportPalette);
    dom.filePalette.addEventListener('change', () => {
      const f = dom.filePalette.files[0];
      dom.filePalette.value = '';
      if (f) importPaletteFile(f);
    });

    // Layer properties
    dom.layerBlend.replaceChildren(...BLEND_MODES.map(([k, l]) => el('option', { value: k }, l)));
    dom.layerOpacity.addEventListener('input', () => {
      const l = activeLayer();
      if (!l) return;
      l.opacity = +dom.layerOpacity.value;
      dom.layerOpacityVal.textContent = l.opacity + '%';
      layerPropsChanged();
    });
    dom.layerOpacity.addEventListener('change', refreshLayers);
    dom.layerBlend.addEventListener('change', () => {
      const l = activeLayer();
      if (!l) return;
      l.blend = dom.layerBlend.value;
      layerPropsChanged();
      refreshLayers();
    });

    // Timeline
    dom.frameDuration.addEventListener('change', () => {
      currentFrame().duration = clamp(Math.round(+dom.frameDuration.value) || 100, 10, 10000);
      refreshFrames();
      scheduleAutosave();
    });
    dom.loopMode.addEventListener('change', () => {
      settings.loopMode = dom.loopMode.value;
      persistSettings();
    });
    dom.btnOnionSettings.addEventListener('click', (e) => {
      e.stopPropagation();
      if (openMenuState && openMenuState.btn === dom.btnOnionSettings) closeMenus();
      else openOnionSettings();
    });

    // Preview
    dom.previewPlay.addEventListener('click', togglePreview);
    dom.previewScale.value = String(settings.previewScale || 0);
    dom.previewScale.addEventListener('change', () => {
      settings.previewScale = +dom.previewScale.value;
      persistSettings();
      drawPreview();
    });

    // Files
    dom.fileOpen.addEventListener('change', () => {
      const f = dom.fileOpen.files[0];
      dom.fileOpen.value = '';
      if (f) openFile(f, openMode);
    });
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth++;
      dom.dropOverlay.classList.add('show');
    });
    window.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) dom.dropOverlay.classList.remove('show');
    });
    window.addEventListener('dragover', (e) => {
      if (hasFiles(e)) e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      dom.dropOverlay.classList.remove('show');
      const f = e.dataTransfer.files[0];
      if (f) openFile(f);
    });

    // Clipboard paste (system images or the internal clipboard)
    document.addEventListener('paste', async (e) => {
      if (isTyping(e.target) || modalStack.length || !sprite) return;
      e.preventDefault();
      const items = e.clipboardData ? [...e.clipboardData.items] : [];
      const item = items.find((it) => it.kind === 'file' && it.type.startsWith('image/'));
      if (item && !(clipboard && clipboardFresh)) {
        try {
          const img = await imageFileToPixels(item.getAsFile());
          pasteClip({ w: img.w, h: img.h, x: 0, y: 0, data: img.px });
        } catch (err) {
          toast(err.message, 'error');
        }
      } else pasteClip(clipboard);
    });

    // Persist before leaving
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') scheduleAutosave.flush();
    });
    window.addEventListener('beforeunload', () => scheduleAutosave.flush());

    // Marching ants
    setInterval(() => {
      if (selection || (drag && drag.tool === 'lasso')) {
        antsPhase = (antsPhase + 1) % 8;
        requestRender();
      }
    }, 110);
  }

  // ===========================================================================
  // Init
  // ===========================================================================
  function init() {
    hydrateIcons(document);
    buildMenus();
    buildToolbar();
    buildKeymap();
    wireUI();
    applyLayout();

    const saved = readJSON(KEYS.autosave, null);
    let restored = false;
    if (saved) {
      try {
        loadSprite(deserialize(saved), saved);
        if (saved.colors) {
          primary = Color.fromHex(saved.colors.primary) ?? primary;
          secondary = Color.fromHex(saved.colors.secondary) ?? secondary;
        }
        restored = true;
      } catch (err) {
        console.warn('Could not restore autosave', err);
      }
    }
    if (!restored) loadSprite(createSprite(32, 32, 'untitled'));
    syncPicker();
    refreshAll();
    dom.stSave.textContent = restored ? 'Restored from browser' : '';
    toast(restored ? 'Welcome back — your last session was restored' : 'Tip: press ? to see all keyboard shortcuts', 'info', 3500);
  }

  // Small debugging / scripting surface.
  window.pixeledit = {
    get sprite() {
      return sprite;
    },
    get frameIndex() {
      return frameIndex;
    },
    get selection() {
      return selection;
    },
    get activeLayerId() {
      return activeLayerId;
    },
    get tool() {
      return tool;
    },
    get view() {
      return { ...view };
    },
    get historyLength() {
      return hist.undo.length;
    },
    run: runCommand,
    setTool,
    setColor: (which, hex) => setColor(which, Color.fromHex(hex)),
    pixel(x, y, layerId = activeLayerId, fi = frameIndex) {
      const cel = getCel(layerId, sprite.frames[fi].id);
      return Color.toHex(cel ? cel[y * sprite.width + x] : 0);
    },
    composite: (fi = frameIndex) => compositePixels(fi),
    serialize: () => serialize(),
    encodeGif: (opts) => GifEncoder.encode(opts),
  };

  init();
})();
