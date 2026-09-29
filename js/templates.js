/* Pixeledit — game asset templates (Unity 2D): sizes, animation tags, pivots and guide layers */
'use strict';

const TEMPLATE_CATEGORIES = [
  ['character', 'Characters'],
  ['environment', 'Environment'],
  ['weapon', 'Weapons'],
  ['prop', 'Props & items'],
  ['effect', 'Effects'],
  ['ui', 'UI'],
  ['blank', 'Blank'],
];

/** Guide painter: faint, non-exported construction lines drawn into a layer buffer. */
function makeGuidePainter(W, H) {
  const buf = new Uint32Array(W * H);
  const C = {
    line: Color.pack(94, 200, 255, 150),
    soft: Color.pack(94, 200, 255, 60),
    fill: Color.pack(94, 200, 255, 34),
    ground: Color.pack(255, 181, 71, 170),
    accent: Color.pack(255, 92, 122, 190),
    alt: Color.pack(61, 220, 151, 60),
  };
  const px = (x, y, c) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = c;
  };
  const g = {
    W,
    H,
    C,
    buf,
    px,
    line: (x0, y0, x1, y1, c = C.line) => Geo.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), (x, y) => px(x, y, c)),
    rect(x, y, w, h, c = C.line) {
      for (let i = 0; i < w; i++) {
        px(x + i, y, c);
        px(x + i, y + h - 1, c);
      }
      for (let j = 0; j < h; j++) {
        px(x, y + j, c);
        px(x + w - 1, y + j, c);
      }
    },
    fill(x, y, w, h, c = C.fill) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c);
    },
    box(x, y, w, h) {
      g.fill(x, y, w, h, C.fill);
      g.rect(x, y, w, h, C.line);
    },
    ellipse(x0, y0, x1, y1, c = C.line) {
      for (const [x, y] of Geo.ellipse(x0, y0, x1, y1)) px(x, y, c);
    },
    dashH(y, x0 = 0, x1 = W - 1, c = C.soft) {
      for (let x = x0; x <= x1; x++) if ((x - x0) % 4 < 2) px(x, y, c);
    },
    dashV(x, y0 = 0, y1 = H - 1, c = C.soft) {
      for (let y = y0; y <= y1; y++) if ((y - y0) % 4 < 2) px(x, y, c);
    },
    ground(y = H - 1) {
      for (let x = 0; x < W; x++) px(x, y, C.ground);
    },
    cross(x, y, r = 2, c = C.accent) {
      for (let k = -r; k <= r; k++) {
        px(x + k, y, c);
        px(x, y + k, c);
      }
    },
    tiles(size) {
      for (let ty = 0; ty < H / size; ty++) {
        for (let tx = 0; tx < W / size; tx++) {
          if ((tx + ty) % 2) g.fill(tx * size, ty * size, size, size, C.fill);
        }
      }
    },
  };
  return g;
}

/**
 * Templates. tags: [name, frames, ms per frame, loop, pingpong?]
 * pivot: 'center' | 'bottom' | 'top-left' | [x, y] in pixels (top-left origin).
 * kind: how Unity export slices it — 'frames' (animation), 'tiles' (tile grid) or 'single'.
 */
const TEMPLATES = [
  // --- Characters -------------------------------------------------------------
  {
    id: 'platformer-hero',
    category: 'character',
    name: 'Platformer hero',
    desc: 'Side-view player with the full platformer set: idle, run, jump, fall, attack, hurt and death.',
    w: 32, h: 32,
    pivot: 'bottom',
    kind: 'frames',
    layers: ['Body'],
    tags: [['idle', 4, 150, true], ['run', 6, 90, true], ['jump', 2, 100, false], ['fall', 2, 100, true], ['attack', 4, 70, false], ['hurt', 2, 100, false], ['death', 5, 120, false]],
    hint: 'Feet on the bottom row, facing right. In Unity, flip X on the SpriteRenderer to face left.',
    ai: 'a side-view 2D platformer hero character, facing right, feet on the bottom row, centered horizontally',
    guide(g) {
      g.ground();
      g.dashV(16, 0, g.H - 2);
      g.box(11, 5, 10, 10);
      g.box(11, 15, 10, 9);
      g.box(12, 24, 3, 7);
      g.box(17, 24, 3, 7);
    },
  },
  {
    id: 'topdown-rpg',
    category: 'character',
    name: 'Top-down RPG character',
    desc: '16×16 RPG walker with idle and walk cycles for down, up and side.',
    w: 16, h: 16,
    pivot: 'bottom',
    kind: 'frames',
    layers: ['Body'],
    tags: [['idle_down', 2, 400, true], ['walk_down', 4, 150, true], ['idle_up', 2, 400, true], ['walk_up', 4, 150, true], ['idle_side', 2, 400, true], ['walk_side', 4, 150, true]],
    hint: 'Side frames face right; flip X in Unity for left. The shadow ellipse marks where the feet touch the ground.',
    ai: 'a top-down (3/4 view) RPG character like classic 16-bit RPGs, head roughly half the height',
    guide(g) {
      g.ellipse(3, 13, 12, 15, g.C.ground);
      g.box(4, 1, 8, 7);
      g.box(5, 8, 6, 5);
      g.dashV(8, 0, 12);
    },
  },
  {
    id: 'enemy-slime',
    category: 'character',
    name: 'Small enemy',
    desc: '16×16 enemy (slime, bat, critter) with idle, move, hurt and death.',
    w: 16, h: 16,
    pivot: 'bottom',
    kind: 'frames',
    layers: ['Body'],
    tags: [['idle', 4, 150, true], ['move', 6, 100, true], ['hurt', 2, 100, false], ['death', 5, 100, false]],
    hint: 'Keep the silhouette readable at 1× — enemies must be recognisable in a split second.',
    ai: 'a small cute enemy creature for a 2D game, sitting on the bottom row',
    guide(g) {
      g.ground();
      g.ellipse(2, 5, 13, 16);
      g.dashV(8, 0, g.H - 2);
    },
  },
  {
    id: 'boss',
    category: 'character',
    name: 'Large boss',
    desc: '64×64 boss with idle, attack, hurt and death animations.',
    w: 64, h: 64,
    pivot: 'bottom',
    kind: 'frames',
    layers: ['Body', 'Details'],
    tags: [['idle', 4, 160, true], ['attack', 6, 90, false], ['hurt', 2, 100, false], ['death', 8, 110, false]],
    hint: 'Block the big shapes first on Body, then add detail and highlights on Details.',
    ai: 'a large menacing boss monster for a 2D side-view game, facing left toward the player, standing on the bottom row',
    guide(g) {
      g.ground();
      g.dashV(32, 0, g.H - 2);
      g.box(18, 8, 28, 22);
      g.box(14, 30, 36, 22);
      g.box(18, 52, 8, 11);
      g.box(38, 52, 8, 11);
    },
  },

  // --- Environment ------------------------------------------------------------
  {
    id: 'tileset-16',
    category: 'environment',
    name: 'Tileset 16×16',
    desc: '8×8 grid of 16px tiles. Exports as sliced tiles ready for the Unity Tile Palette.',
    w: 128, h: 128,
    pivot: 'center',
    kind: 'tiles',
    tile: 16,
    ppu: 16,
    layers: ['Tiles'],
    hint: 'The outlined 3×3 block is a terrain set (corners, edges, centre). Toggle View → Tile Preview to check seams.',
    ai: 'a 2D platformer terrain tileset made of 16×16 tiles on a grid; tiles must tile seamlessly with their neighbours',
    guide(g) {
      g.tiles(16);
      g.rect(0, 0, 48, 48, g.C.line);
      g.rect(48, 0, 32, 32, g.C.accent);
    },
  },
  {
    id: 'tileset-32',
    category: 'environment',
    name: 'Tileset 32×32',
    desc: '8×8 grid of 32px tiles for higher-detail worlds.',
    w: 256, h: 256,
    pivot: 'center',
    kind: 'tiles',
    tile: 32,
    ppu: 32,
    layers: ['Tiles'],
    hint: 'Set Unity’s Grid cell size to 1 — with PPU = 32 each tile is exactly one unit.',
    ai: 'a 2D terrain tileset made of 32×32 tiles; tiles must tile seamlessly',
    guide(g) {
      g.tiles(32);
      g.rect(0, 0, 96, 96, g.C.line);
      g.rect(96, 0, 64, 64, g.C.accent);
    },
  },
  {
    id: 'seamless-texture',
    category: 'environment',
    name: 'Seamless texture',
    desc: '32×32 repeating ground / wall texture with the tile preview switched on.',
    w: 32, h: 32,
    pivot: 'center',
    kind: 'single',
    ppu: 32,
    layers: ['Texture'],
    view: { tileMode: true },
    hint: 'Tile Preview shows the texture repeated 3×3 — fix any seams you see. In Unity use Draw Mode: Tiled.',
    ai: 'a seamless repeating 2D ground/wall texture that tiles perfectly on all four edges',
  },
  {
    id: 'parallax',
    category: 'environment',
    name: 'Parallax background',
    desc: '320×180 background with sky, far, mid and near layers — export each layer as its own sprite.',
    w: 320, h: 180,
    pivot: 'center',
    kind: 'single',
    layers: ['Sky', 'Far', 'Mid', 'Near'],
    perLayer: true,
    hint: 'Export for Unity with “Each layer as its own sprite”, then scroll the layers at different speeds.',
    ai: 'a side-scrolling parallax background landscape, layered from sky to near foreground; left and right edges should wrap seamlessly',
    guide(g) {
      g.dashH(110);
      g.dashH(140, 0, g.W - 1, g.C.ground);
    },
  },
  {
    id: 'prop-tree',
    category: 'environment',
    name: 'Tree / scenery',
    desc: '32×48 scenery object (tree, rock, bush) standing on the ground.',
    w: 32, h: 48,
    pivot: 'bottom',
    kind: 'single',
    layers: ['Object'],
    hint: 'The pivot sits where the object touches the ground, so it sorts correctly with Y-sorting.',
    ai: 'a tree or scenery object for a 2D game, trunk base centered on the bottom row',
    guide(g) {
      g.ground();
      g.ellipse(3, 2, 28, 32);
      g.box(13, 32, 6, 15);
    },
  },

  // --- Weapons ------------------------------------------------------------------
  {
    id: 'melee-weapon',
    category: 'weapon',
    name: 'Sword / melee weapon',
    desc: '32×32 held weapon. The pivot is on the grip so it rotates around the hand.',
    w: 32, h: 32,
    pivot: [8, 24],
    kind: 'single',
    layers: ['Weapon'],
    hint: 'Draw the blade along the diagonal guide; keep the grip on the red cross (the pivot).',
    ai: 'a sword/melee weapon drawn diagonally from the bottom-left grip to the top-right tip',
    guide(g) {
      g.line(8, 24, 27, 5);
      g.line(4, 28, 8, 24, g.C.ground);
      g.cross(8, 24);
    },
  },
  {
    id: 'gun',
    category: 'weapon',
    name: 'Gun',
    desc: '32×16 side-view gun with a firing animation. Pivot on the grip.',
    w: 32, h: 16,
    pivot: [9, 12],
    kind: 'frames',
    layers: ['Weapon'],
    tags: [['idle', 1, 100, true], ['fire', 3, 60, false]],
    hint: 'The barrel points right along the guide line; the muzzle flash goes at the right edge in the fire frames.',
    ai: 'a side-view gun pointing right, grip at the bottom-left',
    guide(g) {
      g.dashH(6, 0, g.W - 1, g.C.line);
      g.box(6, 8, 5, 7);
      g.cross(9, 12);
      g.rect(28, 3, 4, 7, g.C.ground);
    },
  },
  {
    id: 'projectile',
    category: 'weapon',
    name: 'Projectile / bullet',
    desc: '16×16 looping projectile (arrow, fireball, bullet) travelling right.',
    w: 16, h: 16,
    pivot: 'center',
    kind: 'frames',
    layers: ['Projectile'],
    tags: [['fly', 4, 80, true]],
    hint: 'Draw it travelling right — rotate the GameObject in Unity for other directions.',
    ai: 'a projectile (arrow, fireball or energy bolt) flying to the right, centered',
    guide(g) {
      g.dashH(8);
      g.dashV(8);
      g.line(10, 5, 13, 8, g.C.accent);
      g.line(10, 11, 13, 8, g.C.accent);
    },
  },
  {
    id: 'weapon-icon',
    category: 'weapon',
    name: 'Weapon icon',
    desc: '16×16 inventory icon with a 1px safe margin.',
    w: 16, h: 16,
    pivot: 'center',
    kind: 'single',
    layers: ['Icon'],
    hint: 'Keep a 1px transparent margin so outlines are not clipped in UI slots.',
    ai: 'a small inventory icon of a weapon, drawn diagonally, with a dark outline',
    guide(g) {
      g.rect(1, 1, 14, 14, g.C.soft);
    },
  },

  // --- Props & items ------------------------------------------------------------
  {
    id: 'chest',
    category: 'prop',
    name: 'Treasure chest',
    desc: '32×32 chest: closed, opening animation and open.',
    w: 32, h: 32,
    pivot: 'bottom',
    kind: 'frames',
    layers: ['Chest'],
    tags: [['closed', 1, 100, true], ['opening', 4, 90, false], ['open', 1, 100, true]],
    hint: 'Duplicate the closed frame into the opening frames and animate only the lid.',
    ai: 'a wooden treasure chest seen from the front, sitting on the bottom row',
    guide(g) {
      g.ground();
      g.box(5, 12, 22, 19);
      g.dashH(18, 5, 26, g.C.line);
    },
  },
  {
    id: 'coin',
    category: 'prop',
    name: 'Coin / pickup',
    desc: '16×16 spinning collectible.',
    w: 16, h: 16,
    pivot: 'center',
    kind: 'frames',
    layers: ['Coin'],
    tags: [['spin', 6, 90, true]],
    hint: 'Squash the width frame by frame (full → thin → edge → thin) for a spin.',
    ai: 'a shiny gold coin collectible, centered',
    guide(g) {
      g.ellipse(2, 2, 13, 13);
      g.dashV(8);
    },
  },
  {
    id: 'torch',
    category: 'prop',
    name: 'Torch / animated prop',
    desc: '16×32 looping animated prop (torch, candle, campfire).',
    w: 16, h: 32,
    pivot: 'bottom',
    kind: 'frames',
    layers: ['Stand', 'Flame'],
    tags: [['burn', 4, 110, true]],
    hint: 'Keep the stand static on its own layer and animate only the Flame layer.',
    ai: 'a wall torch or standing torch with a flickering flame, base on the bottom row',
    guide(g) {
      g.ground();
      g.box(6, 14, 4, 17);
      g.ellipse(3, 1, 12, 14, g.C.ground);
    },
  },
  {
    id: 'crate',
    category: 'prop',
    name: 'Breakable crate',
    desc: '32×32 destructible prop with a break animation.',
    w: 32, h: 32,
    pivot: 'bottom',
    kind: 'frames',
    layers: ['Crate'],
    tags: [['idle', 1, 100, true], ['break', 5, 80, false]],
    hint: 'Break frames: crack, burst, pieces flying, pieces falling, gone.',
    ai: 'a wooden crate that can be broken, sitting on the bottom row',
    guide(g) {
      g.ground();
      g.box(6, 10, 20, 21);
    },
  },
  {
    id: 'door',
    category: 'prop',
    name: 'Door',
    desc: '32×48 door with an opening animation.',
    w: 32, h: 48,
    pivot: 'bottom',
    kind: 'frames',
    layers: ['Frame', 'Door'],
    tags: [['closed', 1, 100, true], ['opening', 4, 90, false], ['open', 1, 100, true]],
    hint: 'Keep the frame static and animate the door panel on its own layer.',
    ai: 'a dungeon or house door seen from the front, bottom on the bottom row',
    guide(g) {
      g.ground();
      g.box(4, 4, 24, 43);
      g.box(7, 8, 18, 39);
    },
  },
  {
    id: 'potion',
    category: 'prop',
    name: 'Item / potion',
    desc: '16×16 collectible item with a gentle bob animation.',
    w: 16, h: 16,
    pivot: 'center',
    kind: 'frames',
    layers: ['Item'],
    tags: [['idle', 4, 160, true]],
    hint: 'A 1px up-and-down bob over 4 frames makes pickups feel alive.',
    ai: 'a small collectible item such as a health potion, centered',
    guide(g) {
      g.box(5, 2, 6, 3);
      g.ellipse(3, 5, 12, 14);
    },
  },

  // --- Effects --------------------------------------------------------------------
  {
    id: 'explosion',
    category: 'effect',
    name: 'Explosion',
    desc: '64×64 one-shot explosion.',
    w: 64, h: 64,
    pivot: 'center',
    kind: 'frames',
    layers: ['Fire', 'Smoke'],
    tags: [['explode', 8, 60, false]],
    hint: 'Fast bright start, slow smoky finish. Destroy the GameObject when the clip ends.',
    ai: 'a pixel-art explosion effect expanding from the center, bright flash to smoke',
    guide(g) {
      g.ellipse(24, 24, 39, 39, g.C.ground);
      g.ellipse(12, 12, 51, 51);
      g.ellipse(2, 2, 61, 61, g.C.soft);
    },
  },
  {
    id: 'hit-spark',
    category: 'effect',
    name: 'Hit spark',
    desc: '32×32 impact flash for hits and damage.',
    w: 32, h: 32,
    pivot: 'center',
    kind: 'frames',
    layers: ['Spark'],
    tags: [['hit', 4, 50, false]],
    hint: 'Two or three white frames then fade — impacts should be very fast.',
    ai: 'a sharp white-yellow hit/impact spark effect, centered',
    guide(g) {
      g.cross(16, 16, 12, g.C.soft);
      g.line(6, 6, 26, 26, g.C.soft);
      g.line(26, 6, 6, 26, g.C.soft);
    },
  },
  {
    id: 'dust',
    category: 'effect',
    name: 'Dust puff',
    desc: '16×16 landing / running dust.',
    w: 16, h: 16,
    pivot: 'bottom',
    kind: 'frames',
    layers: ['Dust'],
    tags: [['puff', 5, 70, false]],
    hint: 'Spawn it at the character’s feet when landing or turning.',
    ai: 'a small dust puff effect rising from the ground',
    guide(g) {
      g.ground();
      g.ellipse(2, 8, 13, 15);
    },
  },

  // --- UI -------------------------------------------------------------------------
  {
    id: 'item-icon',
    category: 'ui',
    name: 'Item icon',
    desc: '32×32 inventory / shop icon.',
    w: 32, h: 32,
    pivot: 'center',
    kind: 'single',
    layers: ['Icon'],
    hint: 'Keep 1–2px of margin and a dark outline so the icon reads on any slot background.',
    ai: 'an inventory icon for an RPG item, with a dark outline, centered',
    guide(g) {
      g.rect(2, 2, 28, 28, g.C.soft);
    },
  },
  {
    id: 'panel-9slice',
    category: 'ui',
    name: '9-slice panel',
    desc: '48×48 UI panel with 8px borders already set for Unity 9-slicing.',
    w: 48, h: 48,
    pivot: 'center',
    kind: 'single',
    layers: ['Panel'],
    border: [8, 8, 8, 8],
    hint: 'Only the centre stretches. In Unity set the Image Type to Sliced — the borders are exported for you.',
    ai: 'a fantasy/game UI panel frame with a decorative border 8px wide and a plain stretchable centre',
    guide(g) {
      g.dashH(8, 0, g.W - 1, g.C.accent);
      g.dashH(39, 0, g.W - 1, g.C.accent);
      g.dashV(8, 0, g.H - 1, g.C.accent);
      g.dashV(39, 0, g.H - 1, g.C.accent);
    },
  },
  {
    id: 'button',
    category: 'ui',
    name: 'Button states',
    desc: '48×16 button with normal, highlighted, pressed and disabled frames.',
    w: 48, h: 16,
    pivot: 'center',
    kind: 'frames',
    layers: ['Button'],
    border: [4, 4, 4, 4],
    tags: [['normal', 1, 100, false], ['highlighted', 1, 100, false], ['pressed', 1, 100, false], ['disabled', 1, 100, false]],
    hint: 'Each frame exports as its own sprite — use them in the Button’s Sprite Swap transition.',
    ai: 'a game UI button background (no text), with a 4px border',
    guide(g) {
      g.dashV(4, 0, g.H - 1, g.C.accent);
      g.dashV(43, 0, g.H - 1, g.C.accent);
      g.dashH(4, 0, g.W - 1, g.C.accent);
      g.dashH(11, 0, g.W - 1, g.C.accent);
    },
  },
  {
    id: 'heart',
    category: 'ui',
    name: 'Health hearts',
    desc: '16×16 heart icons: full, half and empty.',
    w: 16, h: 16,
    pivot: 'center',
    kind: 'frames',
    layers: ['Heart'],
    tags: [['full', 1, 100, false], ['half', 1, 100, false], ['empty', 1, 100, false]],
    hint: 'Draw the full heart, duplicate the frame, then empty half / all of it.',
    ai: 'a health heart icon for a game HUD',
    guide(g) {
      g.ellipse(1, 2, 8, 9);
      g.ellipse(7, 2, 14, 9);
      g.line(2, 9, 8, 14);
      g.line(13, 9, 8, 14);
    },
  },
  {
    id: 'cursor',
    category: 'ui',
    name: 'Mouse cursor',
    desc: '16×16 cursor with the hotspot (pivot) at the top-left.',
    w: 16, h: 16,
    pivot: 'top-left',
    kind: 'single',
    layers: ['Cursor'],
    hint: 'Use Cursor.SetCursor with hotspot (0, 0) — the tip must be the top-left pixel.',
    ai: 'a game mouse cursor pointer whose tip is the top-left pixel',
    guide(g) {
      g.cross(0, 0, 3);
    },
  },
];

/** Resolves a template pivot to pixel coordinates. */
function templatePivot(t, W, H) {
  if (Array.isArray(t.pivot)) return { x: t.pivot[0], y: t.pivot[1] };
  if (t.pivot === 'bottom') return { x: W / 2, y: H };
  if (t.pivot === 'top-left') return { x: 0, y: 0 };
  return { x: W / 2, y: H / 2 };
}
