/* Pixeledit — Claude assistant: sprite text format, prompts and Messages API streaming */
'use strict';

const ClaudeAI = (() => {
  // The SDK is loaded on demand from a CDN so the editor keeps working offline and without a build step.
  const SDK_VERSION = '0.129.0';
  const SDK_URLS = [`https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@${SDK_VERSION}/+esm`, `https://esm.sh/@anthropic-ai/sdk@${SDK_VERSION}`];
  const MODELS = [
    ['claude-opus-5-5', 'Opus 5.5 (best)'],
    ['claude-sonnet-5-5', 'Sonnet 5.5 (faster)'],
    ['claude-haiku-4-5', 'Haiku 4.5 (cheapest)'],
  ];
  const KEY_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const MAX_KEYS = KEY_CHARS.length;

  /* -------------------------------------------------------------------------
   * Sprite text format
   * ----------------------------------------------------------------------- */

  /**
   * Assigns a single-character key to every color. `palette` colors come first (in order),
   * then any other colors used in `frames`. Colors beyond the key budget map to the nearest key.
   */
  function buildKeys(palette, frames) {
    const keys = new Map([[0, '.']]);
    const entries = [];
    const add = (c) => {
      if (!(c >>> 24) || keys.has(c) || entries.length >= MAX_KEYS) return;
      const k = KEY_CHARS[entries.length];
      keys.set(c, k);
      entries.push([k, c]);
    };
    for (const c of palette || []) add(c);
    const counts = new Map();
    for (const px of frames || []) for (let i = 0; i < px.length; i++) if (px[i] >>> 24 && !keys.has(px[i])) counts.set(px[i], (counts.get(px[i]) || 0) + 1);
    [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([c]) => add(c));
    const keyOf = (c) => {
      if (!(c >>> 24)) return '.';
      const k = keys.get(c);
      if (k) return k;
      let best = '.', bd = Infinity;
      for (const [ek, ec] of entries) {
        const d = Color.dist(c, ec);
        if (d < bd) {
          bd = d;
          best = ek;
        }
      }
      keys.set(c, best);
      return best;
    };
    return { entries, keyOf };
  }

  const hex = (c) => Color.toHex(c).toLowerCase();

  function paletteBlock(entries) {
    return ['palette', '. transparent', ...entries.map(([k, c]) => `${k} ${hex(c)}`)].join('\n');
  }

  /** Encodes frames as sprite text. frames: [{ px: Uint32Array, duration, label }] */
  function encode({ w, h, frames, palette, tags }) {
    const { entries, keyOf } = buildKeys(palette, frames.map((f) => f.px));
    const out = [`size ${w}x${h}`, paletteBlock(entries)];
    frames.forEach((f, i) => {
      out.push(`frame ${i + 1}${f.label ? ' ' + f.label : ''} ${f.duration || 100}ms`);
      for (let y = 0; y < h; y++) {
        let row = '';
        for (let x = 0; x < w; x++) row += keyOf(f.px[y * w + x]);
        out.push(row);
      }
    });
    for (const t of tags || []) out.push(`tag ${t.name} ${t.from + 1}-${t.to + 1} ${t.loop ? 'loop' : 'once'}`);
    return out.join('\n');
  }

  /** Picks the code block that looks most like sprite text (or the whole reply). */
  function extractBlock(text) {
    const blocks = [...String(text).matchAll(/```([\w-]*)[^\n]*\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1].toLowerCase(), body: m[2] }));
    if (!blocks.length) {
      const open = /```[\w-]*[^\n]*\n([\s\S]*)$/.exec(text);
      return open ? open[1] : String(text);
    }
    const scored = blocks.map((b) => ({ b, score: (b.lang === 'sprite' ? 1000 : 0) + (/\bpalette\b/i.test(b.body) ? 100 : 0) + b.body.length / 1000 }));
    scored.sort((a, b) => b.score - a.score);
    return scored[0].b.body;
  }

  const PAL_RE = /^(\S)\s*(?:[:=]|->)?\s*(#[0-9a-f]{6}(?:[0-9a-f]{2})?\b|transparent\b|none\b|clear\b)/i;

  /**
   * Parses sprite text. Returns { w, h, frames: [{ px, duration, label }], tags, palette: [[key, color]], warnings }.
   * Throws when no pixel rows are found.
   */
  function parse(text) {
    const src = extractBlock(text);
    const lines = src.split(/\r?\n/).map((l) => l.replace(/\s+$/, ''));
    const warnings = [];
    const pal = new Map([['.', 0]]);
    const palOrder = [];
    let W = 0, H = 0, extraRows = 0;
    const frames = [];
    const tags = [];
    let cur = null;
    const startFrame = (label = '', duration = 0) => {
      cur = { rows: [], label, duration };
      frames.push(cur);
    };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith(';')) {
        if (!line && cur && cur.rows.length && !cur.explicit && !H) cur = null;
        continue;
      }
      let m;
      if ((m = /^size\s*[:=]?\s*(\d+)\s*[x×*,]\s*(\d+)/i.exec(line))) {
        W = +m[1];
        H = +m[2];
        continue;
      }
      if (/^palette\b/i.test(line)) continue;
      if ((m = /^frame\b(.*)$/i.exec(line))) {
        const rest = m[1].trim();
        const dm = /(\d+)\s*ms\b/i.exec(rest) || /\bduration\s*[:=]?\s*(\d+)/i.exec(rest);
        const label = rest
          .replace(/(\d+)\s*ms\b/i, '')
          .replace(/\bduration\s*[:=]?\s*\d+/i, '')
          .replace(/^[#\s]*\d+\b/, '')
          .replace(/[:()[\]]/g, ' ')
          .trim()
          .split(/\s+/)[0] || '';
        startFrame(label, dm ? +dm[1] : 0);
        cur.explicit = true;
        continue;
      }
      if ((m = /^tag\s+(\S+)\s+(\d+)\s*(?:-|–|to|\.\.)\s*(\d+)(.*)$/i.exec(line))) {
        tags.push({ name: m[1], from: +m[2] - 1, to: +m[3] - 1, loop: !/\b(once|no-?loop|false)\b/i.test(m[4]), pingpong: /ping-?pong/i.test(m[4]) });
        continue;
      }
      const pm = PAL_RE.exec(line);
      if (pm && !isGridRow(line, pal)) {
        const key = pm[1];
        const val = pm[2].toLowerCase();
        const c = val.startsWith('#') ? Color.fromHex(val) : 0;
        if (c !== null) {
          if (!pal.has(key)) palOrder.push([key, c]);
          pal.set(key, c);
        }
        continue;
      }
      let row = line;
      // Strip row numbers ("12: ....", "3 k k k") unless the digits are palette keys.
      m = /^(\d+)\s*([:|])\s*(.+)$/.exec(row) || /^(\d+)()\s+(.+)$/.exec(row);
      if (m && (m[2] || ![...m[1]].some((ch) => pal.has(ch))) && (/^\S+$/.test(m[3]) || /^(\S )+\S$/.test(m[3]))) row = m[3];
      if (/^(\S )+\S$/.test(row)) row = row.replace(/ /g, '');
      if (/\s/.test(row)) continue;
      if (pal.size > 1) {
        let known = 0;
        for (const ch of row) if (pal.has(ch)) known++;
        if (known * 2 < row.length) continue;
      }
      if (cur && cur.explicit && H && cur.rows.length >= H) {
        extraRows++;
        continue;
      }
      if (!cur || (H && cur.rows.length >= H)) startFrame();
      cur.rows.push(row);
    }
    const withRows = frames.filter((f) => f.rows.length);
    if (!withRows.length) throw new Error('No pixel rows found in the reply');
    // Without an explicit size, use the most common row length / row count.
    const mode = (vals) => {
      const c = new Map();
      for (const v of vals) c.set(v, (c.get(v) || 0) + 1);
      return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    };
    if (!W) W = mode(withRows.flatMap((f) => f.rows.map((r) => r.length)));
    if (!H) H = mode(withRows.map((f) => f.rows.length));
    if (!(W >= 1 && H >= 1 && W <= 1024 && H <= 1024)) throw new Error(`Invalid sprite size ${W}×${H}`);
    let unknown = 0, fixedRows = 0;
    const unknownKeys = new Set();
    const outFrames = withRows.map((f) => {
      const px = new Uint32Array(W * H);
      if (f.rows.length !== H) fixedRows++;
      for (let y = 0; y < Math.min(H, f.rows.length); y++) {
        const r = f.rows[y];
        if (r.length !== W) fixedRows++;
        for (let x = 0; x < Math.min(W, r.length); x++) {
          const ch = r[x];
          if (pal.has(ch)) px[y * W + x] = pal.get(ch);
          else {
            unknown++;
            unknownKeys.add(ch);
          }
        }
      }
      return { px, duration: f.duration, label: f.label };
    });
    if (extraRows) warnings.push(`${extraRows} extra row(s) beyond ${H} were ignored`);
    if (fixedRows) warnings.push(`${fixedRows} row(s) had the wrong length and were padded or cut to ${W}×${H}`);
    if (unknown) warnings.push(`${unknown} pixel(s) used keys missing from the palette (${[...unknownKeys].slice(0, 6).join(' ')}) and were left transparent`);
    const n = outFrames.length;
    const okTags = tags.filter((t) => t.from >= 0 && t.to >= t.from && t.from < n).map((t) => ({ ...t, to: Math.min(t.to, n - 1) }));
    return { w: W, h: H, frames: outFrames, tags: okTags, palette: palOrder, warnings };
  }

  function isGridRow(line, pal) {
    if (line.length < 3) return false;
    for (const ch of line) if (!pal.has(ch)) return false;
    return true;
  }

  /** Parses a list of colors (#rrggbb) from a reply. */
  function parsePalette(text) {
    const out = [];
    for (const m of String(text).matchAll(/#([0-9a-f]{6})\b/gi)) {
      const c = Color.fromHex(m[1]);
      if (c !== null && !out.includes(c)) out.push(c);
    }
    return out;
  }

  /* -------------------------------------------------------------------------
   * Prompts
   * ----------------------------------------------------------------------- */
  const SYSTEM = `You are an expert pixel artist making sprites for a Unity 2D game inside Pixeledit, a browser pixel-art editor. You draw by writing sprites in Pixeledit's sprite text format, which the editor imports automatically.

Sprite text format — put the whole sprite in ONE fenced code block tagged \`sprite\`:

\`\`\`sprite
size 8x8
palette
. transparent
k #1a1c2c
r #b13e53
w #f4f4f4
frame 1 120ms
..kkkk..
.krrrrk.
krwrrrrk
krrrrrrk
krrrrrrk
.krrrrk.
..kkkk..
........
\`\`\`

Rules for the format:
- First line: size WxH. Then "palette" and one entry per line: a single-character key, a space, a color as #RRGGBB (or #RRGGBBAA). "." always means transparent.
- Each frame starts with "frame N [label] [duration]ms" and is followed by exactly H rows of exactly W characters. Rows contain only palette keys — no spaces, no row numbers.
- For animations write several frame blocks with the same size and palette.
- Never shorten, summarise or elide rows; every frame must be complete.

Pixel-art craft:
- Clean 1px outlines (usually a dark, slightly saturated hue rather than pure black), a consistent light source from the top-left, 2–4 shades per material, strong readable silhouette at 1× zoom.
- No stray single pixels, no noisy dithering, no anti-aliasing against transparency, no jagged "doubles" in curves.
- Characters face right unless asked otherwise, stand on the bottom row and are centred horizontally with ~1px free at the top and sides. Objects that sit on the ground also touch the bottom row.
- Animation frames keep identical proportions, palette and position; only what moves changes. Looping animations must loop seamlessly from the last frame back to the first.

Outside the code block, reply with at most two short sentences.`;

  function paletteConstraint(entries, strict) {
    if (!entries.length) return 'Choose a small, harmonious palette (at most 16 colors) that suits the subject.';
    return `${strict ? 'Use ONLY these colors, with exactly these keys' : 'Prefer these colors and keys (you may add a few more keys if really needed)'}:\n\`\`\`\n${paletteBlock(entries)}\n\`\`\``;
  }

  /**
   * Builds the prompt for a task.
   * ctx: { task: 'draw'|'animate'|'edit'|'palette'|'review', prompt, w, h, palette: [colors], strictPalette,
   *        reference: { px, frames?: [px] } , frameCount, duration, context, tagName, paletteSize, images: [base64 png] }
   * Returns { system, text, images }
   */
  function buildPrompt(ctx) {
    const about = ctx.context ? `\nContext: ${ctx.context}.` : '';
    const size = `Canvas: exactly ${ctx.w}×${ctx.h} pixels (size ${ctx.w}x${ctx.h}).`;
    const refFrames = ctx.reference ? ctx.reference.frames || [ctx.reference.px] : [];
    const keys = buildKeys(ctx.palette, refFrames);
    const refText = () =>
      ctx.reference
        ? `\n\nReference sprite (the current frame${refFrames.length > 1 ? 's' : ''} in the editor):\n\`\`\`sprite\n${encode({ w: ctx.w, h: ctx.h, frames: refFrames.map((px) => ({ px })), palette: ctx.palette })}\n\`\`\``
        : '';
    let text;
    switch (ctx.task) {
      case 'animate': {
        const n = ctx.frameCount || 4;
        text = `Animate: ${ctx.prompt}
Make ${n} frames (about ${ctx.duration || 100}ms each)${ctx.tagName ? ` for the "${ctx.tagName}" animation` : ''}. ${size}${about}
Keep the exact character/object design, colors and size of the reference sprite. Frame 1 may match the reference pose; every frame must be complete.
${paletteConstraint(keys.entries, ctx.strictPalette)}${refText()}`;
        break;
      }
      case 'edit':
        text = `Edit the reference sprite: ${ctx.prompt}
Return the complete edited sprite as a single frame. ${size}${about}
Keep everything that the instruction does not ask to change.
${paletteConstraint(keys.entries, ctx.strictPalette)}${refText()}`;
        break;
      case 'palette':
        text = `Create a pixel-art palette of ${ctx.paletteSize || 16} colors for: ${ctx.prompt}${about}
Order it as ramps (dark to light) grouped by hue, include a near-black outline color and a near-white highlight.
Reply with a code block tagged \`palette\` containing one color per line as "#RRGGBB name".`;
        break;
      case 'review':
        text = `Review this pixel-art sprite${ctx.frameCount > 1 ? ` animation (${ctx.frameCount} frames shown left to right)` : ''} for a Unity 2D game.${about} ${size}
Give specific, actionable feedback on: silhouette and readability at 1×, color and contrast, shading and light direction, clean-up (stray pixels, jaggies)${ctx.frameCount > 1 ? ', and animation timing / spacing' : ''}. Mention pixel coordinates (x, y from the top-left) where useful.
${ctx.prompt ? `The artist asks: ${ctx.prompt}\n` : ''}Answer in plain text with short bullet points, under 220 words. Do not redraw the sprite.${refText()}`;
        break;
      default:
        text = `Draw: ${ctx.prompt}
${size}${about}
Return one frame.
${paletteConstraint(keys.entries, ctx.strictPalette)}`;
    }
    return { system: SYSTEM, text, images: ctx.images || [] };
  }

  /** Single prompt for pasting into claude.ai (no API key needed). */
  function manualPrompt(p) {
    return `${p.system}\n\n---\n\n${p.text}`;
  }

  /* -------------------------------------------------------------------------
   * Messages API (official SDK, streamed)
   * ----------------------------------------------------------------------- */
  let sdkPromise = null;
  function loadSDK() {
    if (!sdkPromise) {
      sdkPromise = (async () => {
        for (const url of SDK_URLS) {
          try {
            const mod = await import(url);
            const Anthropic = mod.default || mod.Anthropic;
            if (Anthropic) return Anthropic;
          } catch (err) {
            console.warn('Could not load the Anthropic SDK from', url, err);
          }
        }
        sdkPromise = null;
        throw new Error('Could not load the Claude SDK — check your internet connection, or use “Copy prompt” instead.');
      })();
    }
    return sdkPromise;
  }

  function friendlyError(Anthropic, err) {
    if (Anthropic) {
      if (err instanceof Anthropic.APIUserAbortError) return 'Cancelled';
      if (err instanceof Anthropic.AuthenticationError) return 'Invalid API key — check it in the Claude settings.';
      if (err instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use that model.';
      if (err instanceof Anthropic.NotFoundError) return 'Model not found — pick another model.';
      if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the API — wait a moment and try again.';
      if (err instanceof Anthropic.BadRequestError) return 'Request rejected: ' + (err.message || 'bad request');
      if (err instanceof Anthropic.InternalServerError) return 'Claude is overloaded or had an error — try again shortly.';
      if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API — check your connection.';
      if (err instanceof Anthropic.APIError) return `API error ${err.status || ''}: ${err.message}`.trim();
    }
    return err && err.message ? err.message : String(err);
  }

  /**
   * Streams one request. Callbacks: onText(delta), onThinking(delta).
   * Returns { text, usage, stopReason, model }. Rejects with a friendly Error.
   */
  async function run({ apiKey, model, effort, prompt, onText, onThinking, signal }) {
    const Anthropic = await loadSDK();
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
    const content = [
      ...prompt.images.map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data } })),
      { type: 'text', text: prompt.text },
    ];
    const params = { model, max_tokens: 64000, system: prompt.system, messages: [{ role: 'user', content }] };
    const haiku = model.startsWith('claude-haiku');
    let stream;
    try {
      if (haiku) stream = client.messages.stream(params);
      else {
        // Adaptive thinking with readable summaries; refusals fall back to Anthropic's recommended model.
        Object.assign(params, {
          thinking: { type: 'adaptive', display: 'summarized' },
          output_config: { effort: effort || 'medium' },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        });
        stream = client.beta.messages.stream(params);
      }
      if (signal) {
        if (signal.aborted) stream.abort();
        signal.addEventListener('abort', () => stream.abort(), { once: true });
      }
      for await (const event of stream) {
        if (event.type !== 'content_block_delta') continue;
        if (event.delta.type === 'text_delta' && onText) onText(event.delta.text);
        else if (event.delta.type === 'thinking_delta' && onThinking) onThinking(event.delta.thinking);
      }
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') {
        const why = msg.stop_details && msg.stop_details.explanation;
        throw new Error('Claude declined this request' + (why ? `: ${why}` : '.'));
      }
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return { text, usage: msg.usage, stopReason: msg.stop_reason, model: msg.model };
    } catch (err) {
      throw new Error(friendlyError(Anthropic, err));
    }
  }

  return { MODELS, SYSTEM, encode, parse, parsePalette, buildKeys, buildPrompt, manualPrompt, run, loadSDK };
})();
