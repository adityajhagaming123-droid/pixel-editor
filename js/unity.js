/* Pixeledit — Unity export: zip writer, TextureImporter .meta, AnimationClip and AnimatorController YAML */
'use strict';

/* ---------------------------------------------------------------------------
 * Minimal ZIP writer (stored entries, UTF-8 names)
 * ------------------------------------------------------------------------- */
const Zip = (() => {
  const TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    TABLE[n] = c >>> 0;
  }
  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const enc = new TextEncoder();

  /** files: [{ name, data: Uint8Array | string }] → Blob */
  function build(files) {
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true);
      lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(12, time, true);
      ch.setUint16(14, date, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  return { build, crc32 };
})();

/* ---------------------------------------------------------------------------
 * Unity asset writers
 * ------------------------------------------------------------------------- */
const UnityExport = (() => {
  /** Fast 128-bit string hash (cyrb128); deterministic IDs keep Unity references stable across re-exports. */
  function hash128(str) {
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0; i < str.length; i++) {
      const k = str.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= h2 ^ h3 ^ h4;
    h2 ^= h1;
    h3 ^= h1;
    h4 ^= h1;
    return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  }
  const hex8 = (n) => n.toString(16).padStart(8, '0');
  const guidFrom = (str) => hash128(str).map(hex8).join('');
  function randomGuid() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  /** Signed 64-bit id (as a decimal string) for sprite internalIDs. */
  function int64From(str) {
    const [a, b] = hash128(str);
    let v = BigInt.asIntN(64, (BigInt(a) << BigInt(32)) | BigInt(b));
    if (v === BigInt(0) || v === BigInt(21300000)) v = BigInt(1);
    return v.toString();
  }
  /** Positive 62-bit id for local objects inside a .controller file. */
  function localId(str) {
    const [a, b] = hash128(str);
    const v = BigInt.asUintN(62, (BigInt(a) << BigInt(32)) | BigInt(b));
    return (v === BigInt(0) ? BigInt(1) : v).toString();
  }
  /** Unity-safe asset / state name. */
  const safeName = (s, fallback = 'sprite') => String(s || '').trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) || fallback;
  const num = (v) => {
    const r = Math.round(v * 1e6) / 1e6;
    return Object.is(r, -0) ? '0' : String(r);
  };
  const vec2 = (x, y) => `{x: ${num(x)}, y: ${num(y)}}`;
  const vec4 = (b) => `{x: ${b[0] | 0}, y: ${b[1] | 0}, z: ${b[2] | 0}, w: ${b[3] | 0}}`;
  const nextPow2 = (n) => {
    let p = 32;
    while (p < n) p *= 2;
    return p;
  };

  /**
   * TextureImporter .meta for a sprite texture.
   * opts: { guid, ppu, texW, texH, sprites: [{ name, x, y, w, h (top-left origin, px), pivot: [nx, ny] (0..1, bottom-left origin), border: [l, b, r, t] }] }
   * One sprite covering the whole texture is written as Single sprite mode, otherwise Multiple.
   */
  function textureMeta(o) {
    const single = o.sprites.length === 1 && o.sprites[0].x === 0 && o.sprites[0].y === 0 && o.sprites[0].w === o.texW && o.sprites[0].h === o.texH;
    const maxSize = Math.min(16384, Math.max(2048, nextPow2(Math.max(o.texW, o.texH))));
    const first = o.sprites[0] || { pivot: [0.5, 0.5], border: [0, 0, 0, 0] };
    const L = [];
    const ids = o.sprites.map((s) => int64From(o.guid + ':' + s.name));
    L.push('fileFormatVersion: 2', `guid: ${o.guid}`, 'TextureImporter:');
    if (single) L.push('  internalIDToNameTable: []');
    else {
      L.push('  internalIDToNameTable:');
      o.sprites.forEach((s, i) => L.push('  - first:', `      213: ${ids[i]}`, `    second: ${s.name}`));
    }
    L.push(
      '  externalObjects: {}',
      '  serializedVersion: 12',
      '  mipmaps:',
      '    mipMapMode: 0',
      '    enableMipMap: 0',
      '    sRGBTexture: 1',
      '    linearTexture: 0',
      '    fadeOut: 0',
      '    borderMipMap: 0',
      '    mipMapsPreserveCoverage: 0',
      '    alphaTestReferenceValue: 0.5',
      '    mipMapFadeDistanceStart: 1',
      '    mipMapFadeDistanceEnd: 3',
      '  bumpmap:',
      '    convertToNormalMap: 0',
      '    externalNormalMap: 0',
      '    heightScale: 0.25',
      '    normalMapFilter: 0',
      '  isReadable: 0',
      '  streamingMipmaps: 0',
      '  streamingMipmapsPriority: 0',
      '  vTOnly: 0',
      '  ignoreMasterTextureLimit: 0',
      '  grayScaleToAlpha: 0',
      '  generateCubemap: 6',
      '  cubemapConvolution: 0',
      '  seamlessCubemap: 0',
      '  textureFormat: 1',
      `  maxTextureSize: ${maxSize}`,
      '  textureSettings:',
      '    serializedVersion: 2',
      '    filterMode: 0',
      '    aniso: 1',
      '    mipBias: 0',
      '    wrapU: 1',
      '    wrapV: 1',
      '    wrapW: 1',
      '  nPOTScale: 0',
      '  lightmap: 0',
      '  compressionQuality: 50',
      `  spriteMode: ${single ? 1 : 2}`,
      '  spriteExtrude: 1',
      '  spriteMeshType: 0',
      `  alignment: ${single ? 9 : 0}`,
      `  spritePivot: ${single ? vec2(first.pivot[0], first.pivot[1]) : vec2(0.5, 0.5)}`,
      `  spritePixelsToUnits: ${num(o.ppu)}`,
      `  spriteBorder: ${single ? vec4(first.border) : vec4([0, 0, 0, 0])}`,
      '  spriteGenerateFallbackPhysicsShape: 1',
      '  alphaUsage: 1',
      '  alphaIsTransparency: 1',
      '  spriteTessellationDetail: -1',
      '  textureType: 8',
      '  textureShape: 1',
      '  singleChannelComponent: 0',
      '  flipbookRows: 1',
      '  flipbookColumns: 1',
      '  maxTextureSizeSet: 0',
      '  compressionQualitySet: 0',
      '  textureFormatSet: 0',
      '  ignorePngGamma: 0',
      '  applyGammaDecoding: 0',
      '  cookieLightType: 0',
      '  platformSettings:',
      '  - serializedVersion: 3',
      '    buildTarget: DefaultTexturePlatform',
      `    maxTextureSize: ${maxSize}`,
      '    resizeAlgorithm: 0',
      '    textureFormat: -1',
      '    textureCompression: 0',
      '    compressionQuality: 50',
      '    crunchedCompression: 0',
      '    allowsAlphaSplitting: 0',
      '    overridden: 0',
      '    androidETC2FallbackOverride: 0',
      '    forceMaximumCompressionQuality_BC6H_BC7: 0',
      '  spriteSheet:',
      '    serializedVersion: 2'
    );
    if (single) L.push('    sprites: []');
    else {
      L.push('    sprites:');
      o.sprites.forEach((s, i) => {
        L.push(
          '    - serializedVersion: 2',
          `      name: ${s.name}`,
          '      rect:',
          '        serializedVersion: 2',
          `        x: ${s.x}`,
          `        y: ${o.texH - s.y - s.h}`,
          `        width: ${s.w}`,
          `        height: ${s.h}`,
          '      alignment: 9',
          `      pivot: ${vec2(s.pivot[0], s.pivot[1])}`,
          `      border: ${vec4(s.border || [0, 0, 0, 0])}`,
          '      outline: []',
          '      physicsShape: []',
          '      tessellationDetail: 0',
          '      bones: []',
          `      spriteID: ${guidFrom(o.guid + ':spriteID:' + s.name)}`,
          `      internalID: ${ids[i]}`,
          '      vertices: []',
          '      indices: ',
          '      edges: []',
          '      weights: []'
        );
      });
    }
    L.push(
      '    outline: []',
      '    physicsShape: []',
      '    bones: []',
      `    spriteID: ${single ? '5e97eb03825dee720800000000000000' : ''}`,
      '    internalID: 0',
      '    vertices: []',
      '    indices: ',
      '    edges: []',
      '    weights: []',
      '    secondaryTextures: []'
    );
    if (single) L.push('    nameFileIdTable: {}');
    else {
      L.push('    nameFileIdTable:');
      o.sprites.forEach((s, i) => L.push(`      ${s.name}: ${ids[i]}`));
    }
    L.push('  spritePackingTag: ', '  pSDRemoveMatte: 0', '  pSDShowRemoveMatteOption: 0', '  userData: ', '  assetBundleName: ', '  assetBundleVariant: ', '');
    return { text: L.join('\n'), ids: single ? ['21300000'] : ids };
  }

  /** Sample rate that puts every key on a whole sample (e.g. 100 ms frames → 10). */
  function sampleRateFor(durations) {
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const g = durations.reduce((a, d) => gcd(a, Math.max(1, Math.round(d))), 0) || 100;
    const rate = 1000 / g;
    return Number.isInteger(rate) && rate <= 120 ? rate : 60;
  }

  /**
   * Sprite AnimationClip (.anim) driving SpriteRenderer.m_Sprite.
   * o: { name, texGuid, frames: [{ id (sprite fileID), duration (ms) }], loop }
   * The last sprite is keyed again at the end so it is shown for its full duration.
   */
  function animClip(o) {
    const ref = (id) => `{fileID: ${id}, guid: ${o.texGuid}, type: 3}`;
    const keys = [];
    let t = 0;
    for (const f of o.frames) {
      keys.push([t, f.id]);
      t += f.duration / 1000;
    }
    const stop = t;
    if (o.frames.length) keys.push([stop, o.frames[o.frames.length - 1].id]);
    const unique = [...new Set(o.frames.map((f) => f.id))];
    const rate = sampleRateFor(o.frames.map((f) => f.duration));
    const L = [
      '%YAML 1.1',
      '%TAG !u! tag:unity3d.com,2011:',
      '--- !u!74 &7400000',
      'AnimationClip:',
      '  m_ObjectHideFlags: 0',
      '  m_CorrespondingSourceObject: {fileID: 0}',
      '  m_PrefabInstance: {fileID: 0}',
      '  m_PrefabAsset: {fileID: 0}',
      `  m_Name: ${o.name}`,
      '  serializedVersion: 6',
      '  m_Legacy: 0',
      '  m_Compressed: 0',
      '  m_UseHighQualityCurve: 1',
      '  m_RotationCurves: []',
      '  m_CompressedRotationCurves: []',
      '  m_EulerCurves: []',
      '  m_PositionCurves: []',
      '  m_ScaleCurves: []',
      '  m_FloatCurves: []',
      '  m_PPtrCurves:',
      '  - curve:',
    ];
    for (const [time, id] of keys) L.push(`    - time: ${num(time)}`, `      value: ${ref(id)}`);
    L.push(
      '    attribute: m_Sprite',
      '    path: ',
      '    classID: 212',
      '    script: {fileID: 0}',
      `  m_SampleRate: ${rate}`,
      '  m_WrapMode: 0',
      '  m_Bounds:',
      '    m_Center: {x: 0, y: 0, z: 0}',
      '    m_Extent: {x: 0, y: 0, z: 0}',
      '  m_ClipBindingConstant:',
      '    genericBindings:',
      '    - serializedVersion: 2',
      '      path: 0',
      '      attribute: 0',
      '      script: {fileID: 0}',
      '      typeID: 212',
      '      customType: 23',
      '      isPPtrCurve: 1',
      '    pptrCurveMapping:'
    );
    for (const id of unique) L.push(`    - ${ref(id)}`);
    L.push(
      '  m_AnimationClipSettings:',
      '    serializedVersion: 2',
      '    m_AdditiveReferencePoseClip: {fileID: 0}',
      '    m_AdditiveReferencePoseTime: 0',
      '    m_StartTime: 0',
      `    m_StopTime: ${num(stop)}`,
      '    m_OrientationOffsetY: 0',
      '    m_Level: 0',
      '    m_CycleOffset: 0',
      '    m_HasAdditiveReferencePose: 0',
      `    m_LoopTime: ${o.loop ? 1 : 0}`,
      '    m_LoopBlend: 0',
      '    m_LoopBlendOrientation: 0',
      '    m_LoopBlendPositionY: 0',
      '    m_LoopBlendPositionXZ: 0',
      '    m_KeepOriginalOrientation: 0',
      '    m_KeepOriginalPositionY: 1',
      '    m_KeepOriginalPositionXZ: 0',
      '    m_HeightFromFeet: 0',
      '    m_Mirror: 0',
      '  m_EditorCurves: []',
      '  m_EulerEditorCurves: []',
      '  m_HasGenericRootTransform: 0',
      '  m_HasMotionFloatCurves: 0',
      '  m_Events: []',
      ''
    );
    return L.join('\n');
  }

  /** AnimatorController with one state per clip (no transitions); the first clip is the default state. */
  function controller(o) {
    const sm = localId(o.seed + ':statemachine');
    const states = o.states.map((s) => ({ ...s, id: localId(o.seed + ':state:' + s.name) }));
    const L = [
      '%YAML 1.1',
      '%TAG !u! tag:unity3d.com,2011:',
      '--- !u!91 &9100000',
      'AnimatorController:',
      '  m_ObjectHideFlags: 0',
      '  m_CorrespondingSourceObject: {fileID: 0}',
      '  m_PrefabInstance: {fileID: 0}',
      '  m_PrefabAsset: {fileID: 0}',
      `  m_Name: ${o.name}`,
      '  serializedVersion: 5',
      '  m_AnimatorParameters: []',
      '  m_AnimatorLayers:',
      '  - serializedVersion: 5',
      '    m_Name: Base Layer',
      `    m_StateMachine: {fileID: ${sm}}`,
      '    m_Mask: {fileID: 0}',
      '    m_Motions: []',
      '    m_Behaviours: []',
      '    m_BlendingMode: 0',
      '    m_SyncedLayerIndex: -1',
      '    m_DefaultWeight: 0',
      '    m_IKPass: 0',
      '    m_SyncedLayerAffectsTiming: 0',
      '    m_Controller: {fileID: 9100000}',
      `--- !u!1107 &${sm}`,
      'AnimatorStateMachine:',
      '  serializedVersion: 6',
      '  m_ObjectHideFlags: 1',
      '  m_CorrespondingSourceObject: {fileID: 0}',
      '  m_PrefabInstance: {fileID: 0}',
      '  m_PrefabAsset: {fileID: 0}',
      '  m_Name: Base Layer',
      '  m_ChildStates:',
    ];
    states.forEach((s, i) => {
      L.push('  - serializedVersion: 1', `    m_State: {fileID: ${s.id}}`, `    m_Position: {x: ${300 + (i % 3) * 220}, y: ${40 + Math.floor(i / 3) * 70}, z: 0}`);
    });
    L.push(
      '  m_ChildStateMachines: []',
      '  m_AnyStateTransitions: []',
      '  m_EntryTransitions: []',
      '  m_StateMachineTransitions: {}',
      '  m_StateMachineBehaviours: []',
      '  m_AnyStatePosition: {x: 50, y: 20, z: 0}',
      '  m_EntryPosition: {x: 50, y: 120, z: 0}',
      '  m_ExitPosition: {x: 50, y: 220, z: 0}',
      '  m_ParentStateMachinePosition: {x: 800, y: 20, z: 0}',
      `  m_DefaultState: {fileID: ${states.length ? states[0].id : 0}}`
    );
    for (const s of states) {
      L.push(
        `--- !u!1102 &${s.id}`,
        'AnimatorState:',
        '  serializedVersion: 6',
        '  m_ObjectHideFlags: 1',
        '  m_CorrespondingSourceObject: {fileID: 0}',
        '  m_PrefabInstance: {fileID: 0}',
        '  m_PrefabAsset: {fileID: 0}',
        `  m_Name: ${s.name}`,
        '  m_Speed: 1',
        '  m_CycleOffset: 0',
        '  m_Transitions: []',
        '  m_StateMachineBehaviours: []',
        '  m_Position: {x: 50, y: 50, z: 0}',
        '  m_IKOnFeet: 0',
        '  m_WriteDefaultValues: 1',
        '  m_Mirror: 0',
        '  m_SpeedParameterActive: 0',
        '  m_MirrorParameterActive: 0',
        '  m_CycleOffsetParameterActive: 0',
        '  m_TimeParameterActive: 0',
        `  m_Motion: {fileID: 7400000, guid: ${s.animGuid}, type: 2}`,
        '  m_Tag: ',
        '  m_SpeedParameter: ',
        '  m_MirrorParameter: ',
        '  m_CycleOffsetParameter: ',
        '  m_TimeParameter: '
      );
    }
    L.push('');
    return L.join('\n');
  }

  /** .meta for native assets (.anim / .controller) so the controller can reference clips by GUID. */
  function nativeMeta(guid, mainObjectFileID) {
    return ['fileFormatVersion: 2', `guid: ${guid}`, 'NativeFormatImporter:', '  externalObjects: {}', `  mainObjectFileID: ${mainObjectFileID}`, '  userData: ', '  assetBundleName: ', '  assetBundleVariant: ', ''].join('\n');
  }

  return { hash128, guidFrom, randomGuid, int64From, localId, safeName, sampleRateFor, textureMeta, animClip, controller, nativeMeta };
})();
