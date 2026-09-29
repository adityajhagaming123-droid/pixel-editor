# Pixeledit

A pixel art and sprite animation editor for **Unity 2D games** that runs entirely in the browser. It has no build step and no dependencies.

**Live:** https://adityajhagaming123-droid.github.io/pixel-editor/

## Made for Unity 2D

**Game asset templates.** File → New Sprite opens a gallery of ready-to-draw templates:

| Category | Templates |
|---|---|
| Characters | Platformer hero (idle, run, jump, fall, attack, hurt, death), top-down RPG walker, small enemy, large boss |
| Environment | 16×16 and 32×32 tilesets, seamless texture, parallax background, tree / scenery |
| Weapons | Sword / melee weapon (pivot on the grip), gun with fire animation, projectile, weapon icon |
| Props & items | Treasure chest, coin, torch, breakable crate, door, potion |
| Effects | Explosion, hit spark, dust puff |
| UI | Item icon, 9-slice panel, button states, health hearts, mouse cursor |

Each template sets the canvas size, frames and durations, named animation tags, the pivot and pixels-per-unit. Most also add a faint **guide layer** with proportions, a ground line or a tile layout.

**Animation tags.** Name frame ranges such as `idle`, `run` or `attack`: Shift+click frames, then press **Alt+T** or the Tag button. Tags appear as coloured bars above the timeline. Clicking one plays just that animation, and each tag becomes a Unity animation clip. Tags can loop, play once or ping-pong.

**Pivot and pixels per unit.** With the Pivot tool (**P**), click where the sprite's origin should be, for example the feet or a weapon grip. The options bar shows the pivot in Unity coordinates and the sprite's size in world units.

**Guide layers.** Any layer can be marked as a guide (Layer → Guide Layer). Guide layers show while you draw but are never exported.

**Export for Unity** (**Ctrl+Shift+U**, or the blue *Unity* button) downloads a `.zip` to unzip into `Assets/`:

- the sprite sheet PNG plus a `.png.meta` that Unity reads on import: Sprite (Multiple), sliced into frames, Point filtering, no compression, no mipmaps, your PPU, pivots and 9-slice borders
- one `.anim` clip per tag, with per-frame durations and Loop Time on or off
- an Animator controller with one state per clip, so `GetComponent<Animator>().Play("run")` works immediately
- optionally, JSON sprite-sheet data in Aseprite's format, for other engines

You can slice by animation frames, by a tile grid (for the Tile Palette), or as a single sprite, and optionally export each layer as its own sprite (for parallax layers). GUIDs and sprite IDs stay the same when you re-export, so replacing the files updates your scenes and prefabs in place.

## Claude assistant

The Claude menu (or **Alt+A**) can:

- **Draw** a new sprite from a description
- **Animate**: fill a tag's frames (for example the 6 empty `run` frames from a template) or add new frames with a new tag
- **Edit** the current frame ("add a dark outline", "make it face left")
- **Palette**: build a palette for a mood or setting
- **Review** a sprite or animation and give pixel-art feedback

There are two ways to use it:

1. **With an API key.** Paste an Anthropic API key (Claude → Claude API Key…). Requests go straight from your browser to `api.anthropic.com` through the official SDK, which loads from a CDN only when needed. Replies stream in, and the result lands on a new layer (or new frames) that Undo can remove. The key stays in your browser.
2. **Without a key.** Press *Copy prompt*, paste it into [claude.ai](https://claude.ai), then paste Claude's reply back and press *Apply reply*.

Claude draws in a plain-text **sprite format** that you can also use by hand (Claude → Copy Frame as Sprite Text / Import Sprite Text):

````
```sprite
size 8x8
palette
. transparent
k #1a1c2c
r #b13e53
frame 1 120ms
..kkkk..
.krrrrk.
...
```
````

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
- Export for Unity (see above)
- Export a PNG at any scale, a spritesheet (strip or grid), or an animated GIF with the built-in encoder, for all frames or a single tag
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
| Pivot | P | | New animation tag | Alt+T |
| | | | Export for Unity | Ctrl+Shift+U |
| | | | Claude assistant | Alt+A |

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
js/unity.js       zip writer and Unity .meta / .anim / .controller writers
js/templates.js   game asset templates and guide drawings
js/claude.js      sprite text format, prompts and Claude API streaming
js/app.js         editor: document model, history, rendering, tools, UI
```
