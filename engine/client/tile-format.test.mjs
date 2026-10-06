import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { tileParts, tableEdgeParts, characterFrame, mapTile, snapshotPreview } from './tile-format.mjs';
import { FLOOR, WALL, WATERFALL } from './autotile-tables.mjs';

test('B–E and A5 are arranged in two 8-column banks, not a single 16-column sequence', () => {
  assert.deepEqual(tileParts(128)[0], { sheet: 5, sx: 384, sy: 0, sw: 48, sh: 48, dx: 0, dy: 0, dw: 48, dh: 48 });
  assert.equal(tileParts(256)[0].sheet, 6);
  assert.deepEqual([tileParts(1536)[0].sheet, tileParts(1536)[0].sx, tileParts(1536)[0].sy], [4, 0, 0]);
  assert.equal(tileParts(0).length, 0);
  assert.equal(tileParts(1024).length, 0);
});

test('autotile shape tables have complete floor, wall and waterfall shapes', () => {
  assert.deepEqual([FLOOR.length, WALL.length, WATERFALL.length], [48, 16, 4]);
  for (const table of [FLOOR, WALL, WATERFALL]) for (const shape of table) assert.equal(shape.length, 4);
  assert.notDeepEqual(tileParts(2048, [], 0), tileParts(2048, [], 1));
  assert.deepEqual(tileParts(2048, [], 1), tileParts(2048, [], 3));
  assert.deepEqual(tileParts(2144, [], 0), tileParts(2144, [], 1));
});

test('all used map tiles match isolated legacy format decoder over twelve animation frames', () => {
  // The legacy implementation is a test oracle only. Browser runtime never imports it.
  const source = fs.readFileSync(new URL('../../js/rpg_core.js', import.meta.url), 'utf8');
  const sandbox = { Tilemap: function () {}, output: [] };
  vm.createContext(sandbox);
  const methods = ['getAutotileKind', 'getAutotileShape', 'isTileA1', 'isTileA2', 'isTileA3', 'isTileA4', 'isTileA5'];
  for (const method of methods) {
    const body = source.match(new RegExp(`Tilemap\\.${method} = function\\([^]*?\\n};`))?.[0];
    assert.ok(body, `oracle method ${method}`); vm.runInContext(body, sandbox);
  }
  for (const method of ['_drawAutotile', '_drawNormalTile', '_drawTableEdge', '_isTableTile']) {
    const body = source.match(new RegExp(`Tilemap\\.prototype\\.${method} = function\\([^]*?\\n};`))?.[0];
    assert.ok(body, `oracle method ${method}`); vm.runInContext(body, sandbox);
  }
  const T = sandbox.Tilemap;
  Object.assign(T, { TILE_ID_A1: 2048, TILE_ID_A2: 2816, TILE_ID_A3: 4352, TILE_ID_A4: 5888, TILE_ID_A5: 1536, TILE_ID_MAX: 8192,
    FLOOR_AUTOTILE_TABLE: FLOOR, WALL_AUTOTILE_TABLE: WALL, WATERFALL_AUTOTILE_TABLE: WATERFALL });
  const tilesets = JSON.parse(fs.readFileSync(new URL('../../data/Tilesets.json', import.meta.url)));
  const dataDir = new URL('../../data/', import.meta.url);
  let checked = 0;
  for (const file of fs.readdirSync(dataDir).filter(name => /^Map\d+\.json$/.test(name))) {
    const map = JSON.parse(fs.readFileSync(new URL(file, dataDir))), flags = tilesets[map.tilesetId]?.flags || [];
    const legacy = new T(); Object.assign(legacy, { flags, _tileWidth: 48, _tileHeight: 48, bitmaps: [1,2,3,4,5,6,7,8,9] });
    const used = new Set(map.data.slice(0, map.width * map.height * 4).filter(Boolean));
    for (const id of used) for (let frame = 0; frame < 12; frame++) {
      legacy.animationFrame = frame; const expected = [];
      const target = { bltImage(sheet, sx, sy, sw, sh, dx, dy, dw, dh) { expected.push({ sheet: sheet - 1, sx, sy, sw, sh, dx, dy, dw, dh }); } };
      if (id >= 2048) legacy._drawAutotile(target, id, 0, 0); else legacy._drawNormalTile(target, id, 0, 0);
      assert.deepEqual(tileParts(id, flags, frame), expected, `${file} tile ${id} frame ${frame}`);
      if (legacy._isTableTile(id)) {
        expected.length = 0; legacy._drawTableEdge(target, id, 0, 0); assert.deepEqual(tableEdgeParts(id), expected, `table edge ${id}`);
      }
      checked++;
    }
  }
  assert.ok(checked > 1000, `checked ${checked} actual map/frame combinations`);
});

test('character extraction handles normal sheets, !$ big objects and nonstandard frame dimensions', () => {
  assert.deepEqual(characterFrame('Actor1', 5, 2, 8, 576, 384), { sx: 240, sy: 336, sw: 48, sh: 48, shiftY: 6 });
  assert.deepEqual(characterFrame('!$Gate1', 0, 1, 2, 432, 384), { sx: 144, sy: 0, sw: 144, sh: 96, shiftY: 0 });
  assert.deepEqual(characterFrame('$Monster', 0, 0, 4, 288, 512), { sx: 0, sy: 128, sw: 96, sh: 128, shiftY: 6 });
});

test('map reading respects independent horizontal and vertical wrap modes', () => {
  const map = { width: 2, height: 2, data: [1, 2, 3, 4], scrollType: 0 };
  assert.equal(mapTile(map, -1, 0, 0), 0);
  assert.equal(mapTile({ ...map, scrollType: 2 }, -1, 0, 0), 2);
  assert.equal(mapTile({ ...map, scrollType: 1 }, 0, -1, 0), 3);
  assert.equal(mapTile({ ...map, scrollType: 3 }, -1, -1, 0), 4);
  assert.equal(mapTile(map, 0, 0, 1), 0);
});

test('content preview never invents personal state to select conditional event pages', () => {
  const map = { events: [null, { id: 1, name: 'Chest', x: 2, y: 3, pages: [
    { conditions: { switch1Valid: true }, image: { characterName: 'Hidden' } },
    { conditions: { switch1Valid: false }, image: { characterName: '!Chest', pattern: 1 }, priorityType: 1 }
  ] }] };
  const preview = snapshotPreview(map, 4);
  assert.equal(preview.playerId, null);
  assert.equal(preview.events[0].image.characterName, '!Chest');
  assert.deepEqual(preview.players, []);
});
