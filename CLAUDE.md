# Pixeledit

Browser pixel-art and sprite-animation editor aimed at Unity 2D games. Plain HTML/CSS/JS served as a static site (GitHub Pages). No build step, no package.json, no bundler.

## Layout

- `index.html` is the app shell. Scripts are classic `<script>` tags (not modules) loaded in this order: `util.js`, `palettes.js`, `gif.js`, `icons.js`, `unity.js`, `templates.js`, `claude.js`, `app.js`. Each defines globals (`Color`, `Geo`, `UnityExport`, `Zip`, `TEMPLATES`, `ClaudeAI`, …) that `app.js` uses.
- `js/app.js` is one IIFE holding the whole editor: document model, undo history, rendering, tools, commands and menus, dialogs, import/export and UI wiring. It is organised into sections with `// ====` banners.
- `js/unity.js`: stored-zip writer; Unity `TextureImporter` `.meta`, `AnimationClip` `.anim` and `AnimatorController` YAML writers. IDs are deterministic hashes of the project GUID and names, so re-exports keep references stable.
- `js/templates.js`: `TEMPLATES` (game asset presets: size, tags, pivot, PPU, guide painter) and `makeGuidePainter`.
- `js/claude.js`: the sprite text format (`encode` / `parse`), prompt builders, and streaming calls to the Messages API. The official `@anthropic-ai/sdk` is loaded by dynamic `import()` from a CDN (pinned version), with `dangerouslyAllowBrowser: true` and a user-supplied key.

## Document model (app.js)

`sprite = { name, width, height, layers[], frames[], cels: Map<"layerId|frameId", Uint32Array>, tags[], pivot {x,y}, unity {ppu, guid, border[l,b,r,t], kind, tile}, template }`

- Pixels are packed little-endian RGBA in `Uint32Array`. `Color.pack` / `Color.unpack` convert them.
- Tags are inclusive frame-index ranges `{ id, name, from, to, color, loop, pingpong }`. Frame insert and delete must call `tagsFrameInserted` / `tagsFrameDeleted`.
- Layers with `guide: true` show in the editor but are left out of every export. Use `compositePixels(fi, true)` / `getComposite(fi, true)` for export-facing output.
- History: wrap mutations in `begin(label)` … `commit()`, and write cels through `writableCel()` (copy-on-write). Snapshots include tags and pivot.
- Commands are registered with `command(id, label, keys, run, extra)` and placed in `MENU`. Tools live in `TOOLS` / `TOOL_GROUPS`.

## Conventions

- Keep it dependency-free and working from `file://` too. No ES module syntax in the scripts.
- Match the existing style: 2-space indent, single quotes, the `el(tag, props, ...children)` DOM helper, and dialogs built with `openModal`, `field`, `row` and friends.
- Colours and sizes come from the CSS variables in `style.css`, which is dark-theme only.

## Running and checking

- Serve the folder: `python3 -m http.server 8765` (or `npx http-server .`) and open `http://localhost:8765/`.
- `window.pixeledit` is a small scripting surface for automated browser checks (Playwright): `sprite`, `run(commandId)`, `setTool`, `setColor`, `pixel`, `composite`, `serialize`, `fromTemplate`, `unityZip`, `applySprite`, …
- There is no test suite in the repo. Verify changes in a real browser, and lint with ESLint using `ecmaVersion: 2022`, `sourceType: 'script'` and browser globals.
