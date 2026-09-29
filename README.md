# Pixeledit

A pixel art and sprite animation editor that runs entirely in the browser. It has no build step and no dependencies.

**Live:** https://adityajhagaming123-droid.github.io/pixel-editor/

## Features

**Drawing**
- Pencil (with pixel-perfect mode), eraser, fill (contiguous / global, with tolerance), line, rectangle and ellipse (outline or filled)
- Dither brush with 12 / 25 / 50 / 75 % ordered-dither patterns
- Shade tool: lighten or darken by lightness, or step along the palette ramp
- Gradient tool, dithered (Bayer) or smooth, which fills the selection or the whole layer
- Square and round brushes from 1 to 64 px, with horizontal and vertical symmetry
- Eyedropper: hold **Alt** with any brush, or right-click to pick the secondary color

**Selections**
- Rectangle select, lasso and magic wand, each with replace / add / subtract / intersect modes
- Move tool that lifts pixels without destroying what's underneath; arrow keys nudge
- Cut / copy / paste, including pasting images from other apps
- Flip and rotate the selection or layer

**Layers**
- Unlimited layers with opacity, 17 blend modes, hide / solo / lock, rename, and drag to reorder
- Merge down and flatten

**Animation**
- Frames with per-frame durations, drag to reorder, duplicate and reverse
- Playback in loop or ping-pong mode, plus an independent preview window
- Onion skinning: frames before and after, tinted, current layer only or all layers

**Canvas and view**
- Canvas up to 1024×1024
- Smooth zoom to the cursor and pan with Space, the middle mouse button or a two-finger pinch
- Pixel grid, a tile grid for tilesets, and a 3×3 tile preview for seamless textures

**Color**
- HSV picker with alpha, hex and RGBA inputs, and recent colors
- 12 built-in palettes (DB32, Endesga 32, PICO-8, Sweetie 16, Game Boy…)
- Import palettes from .hex, .gpl or .txt files and from images; extract a palette from the sprite

**Image**
- Adjust hue, saturation, lightness and contrast with a live preview
- Invert, desaturate, outline, replace color
- Canvas size with anchor, nearest-neighbour scaling, crop, trim, and flipping or rotating the whole canvas

**Import, export and saving**
- Export a PNG at any scale, a spritesheet (strip or grid), or an animated GIF with the built-in encoder
- Save and open `.pxl` project files; the project is autosaved in the browser
- Open images as a new sprite, a layer, or a spritesheet sliced into frames; upscaled pixel art is detected and imported at 1×
- Drag and drop files onto the window

## Keyboard shortcuts

Press **?** in the app for the full list. The most useful ones:

| Tool | Key | | Action | Key |
|---|---|---|---|---|
| Pencil | B | | Undo / Redo | Ctrl+Z / Ctrl+Y |
| Eraser | E | | Copy / Cut / Paste | Ctrl+C / X / V |
| Fill | G | | Select all / Deselect | Ctrl+A / Ctrl+D |
| Gradient | Shift+G | | Brush size | [ / ] |
| Eyedropper | I (or hold Alt) | | Swap colors | X |
| Line / Rect / Ellipse | L / R / O | | Play / Pause | Enter |
| Dither / Shade | D / S | | Prev / Next frame | , / . |
| Select / Lasso / Wand | M / Q / W | | New frame / layer | Alt+N / Shift+N |
| Move / Hand | V / H (or hold Space) | | Zoom / Fit | + − / 0 |

## Development

It's plain HTML, CSS and JavaScript. Serve the folder with any static server, for example:

```sh
npx http-server .
```

```
index.html        app shell
style.css         styles
js/util.js        colors, raster geometry, encoding, DOM helpers
js/palettes.js    built-in palettes
js/gif.js         GIF89a encoder (LZW + median-cut quantizer)
js/icons.js       inline SVG icons
js/app.js         editor: document model, history, rendering, tools, UI
```
