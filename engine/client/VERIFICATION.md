# Browser client verification

## Verified locally on 2026-10-06

- Actual in-app browser: login, persisted account after server restart, map transfer to Rural and School Hall, tile/character rendering, direction-key taps, existing equipment-repair dialogue and its No branch, imported Curry Bread recipe, and development loadout.
- Inventory remained open while the authoritative tick advanced from 910 to 1376 and forbidden-zone damage changed HP from 544 to 404. Browser warning/error log was empty on the checked map views.
- The automated suite passed 38 non-database checks. The separately enabled MySQL suite passed 12 reported tests (including parent groups), covering two WebSocket clients, attacks/death/drop pickup, idempotency, reconnect, all 30 map HTTP loads and 27 playable transfers. This is not a claim of visually testing all maps or running a capacity test.
- Not completed: exhaustive plugin/skill semantics, two simultaneously operated browser UIs, responsive-layout sweep and long-duration network fault testing.

This client is an independent Canvas 2D renderer and ES-module application. It does not load `rpg_core.js`, `rpg_objects.js`, `rpg_scenes.js`, PIXI, or RPG Maker plugins. Autotile quarter-coordinate tables describe the existing MV/MZ file format and come from this project's legacy runtime.

Run the decoder and protocol regression tests with `node --test engine/client/*.test.mjs` from the repository root. The tests compare every tile actually present in the project's maps across twelve animation phases against isolated legacy decoder functions, check character-sheet slicing and map wrapping, and verify forbidden-zone activation/expiry boundaries using the server clock.

Browser integration checklist, to run against the new engine HTTP server:

1. Open `/`, inspect the login screen, and enter content preview without a database account.
2. Inspect Map001 (overworld water), Map026 and Map029 (ARPG tests), an interior table/ceiling map, and the large map. Check autotile edges, water animation, table edges, object characters, shadows, and star-layer occlusion.
3. Switch through all maps. Missing resources must appear in the compatibility panel instead of crashing the client.
4. Register/login, move and attack. Use two browser sessions to confirm remote movement and damage updates while one session's inventory panel remains open.
5. Exercise development loadout, spawn enemies, skill selection, inventory use/equip, recipes, death/respawn, and forbidden-zone warnings.
6. Test dialogue continuation/choices, map transfer, music toggle and resource errors.
7. Disconnect and reconnect the server connection; inspect authoritative snapshots after reconnect. No gameplay operation is queued locally for later replay.
8. Capture desktop login, map preview, connected ARPG and inventory screenshots. Inspect at a narrow viewport for overflow.

Known explicit compatibility boundaries: standard 48-pixel tiles, MV image-sheet animations; no MZ Effekseer renderer, plugin-specific character-layout decoding, plugin runtime execution or parallax plugin layers. Preview selects the first unconditional event page and does not execute commands. Looped maps can be read by the decoder, but the camera currently clamps at the authored map boundary.

## Protocol and session behavior

- The login/register form matches the API's 2–32-character username and 6–128-character password limits. Successful registration also logs in. Controls remain disabled until the content manifest is loaded.
- Each connection validates the session with `GET /api/session` and `Authorization: Bearer …`. A 401 returns to the login form; network failures and a temporarily unavailable database retry with increasing delays up to 15 seconds. Sessions are held by this server process, so a server restart requires logging in again; persisted player state remains in MySQL.
- Gameplay actions are sent only after the first authoritative snapshot. Map fetches are scoped to the current session generation so a late preview response cannot overwrite an online snapshot. Opening inventory/crafting/report stops local movement input but leaves the socket and rendering active.
- The zone warning and tint use `snapshot.serverTime`, `zone.startsAt` and `zone.endsAt`, never the browser clock. The current developer zone covers the entire map; future rectangular zones are also drawable.
- Account state is not simulated in preview. Switching out of an account clears stale dialogue, forbidden-zone status and transient picture/fade effects. Browser visibility changes clear held input; snapshots still restore authoritative state on return.
- Event presentations support MV sheet animations/balloons, basic image show/move/rotate/erase, audio, fades, flash and shake. Color tone is an approximation rather than MV's exact pixel shader. Unknown presentation codes are logged once and included in the compatibility panel. Audio panning, transition timing for audio fades, MZ Effekseer, weather, number input and specialized plugin UI are not implemented.
