# Sandbox & editor

The TileLab **editor** and **game shell** share the same sim core (`GameState`, grid, nav, physics) but mount different UI and input. Sandbox systems are the engine-facing half of “play with props on a grid”; snake is one game launcher on top.

**Related:** grid edit contract → [grid-contract.md](../foundations/grid-contract.md) · snake game → [games/snake.md](../games/snake.md) · code map → [library-audit.md](../library-audit.md) §3.6

---

## Two shells, one engine

| Mode | Mount | UI | Typical use |
|---|---|---|---|
| **TileLab (editor)** | `Apps/Editor/ui/editorUi.js` → `TILELAB_UI_HTML` | Sidebar panels (Props, Profile, JSON), map overview, toolbar toggles | Author maps, room graphs, puzzles, profile tuning |
| **Game shell** | `Apps/Editor/ui/mountGameShell.js` | Minimal toolbar + `#gameStage` canvas | `?game=snake`, `?game=puzzle` — no sidebar |

Shared bootstrap: `Apps/Editor/engine.js`, `TileLabEditorState`, `state.obstacleGrid`, `NavRuntime`, kinetic tick.

```text
runGameLaunch(state, launcher)
  hide editor chrome if launcher.hideEditor
  mountGameShell OR stay in editorUi
  launcher.setup(state)     — e.g. setupSnakeGame
  game session hooks → appendOverlayCommands, tick, contact side effects
```

Launchers: `Libraries/Game/gameLaunchers.js` (`snake`, `puzzle`). Query parsing: `parseGameLaunchQuery.js`.

---

## Sandbox controller (pointer + behaviors)

**Mount:** `Apps/Editor/world/mountSandboxController.js` → `createSandboxController` (`Libraries/SandboxEditor/`).

| Piece | Role | Status |
|---|---|---|
| Pointer gestures | Marquee, select, place, drag | ✅ |
| Behavior registry | Per-prop active behavior id | ✅ |
| Ground-nav behaviors | direct, HPA, flow | ✅ |
| Drag launch + facing | Pinball-style launch | ✅ |
| Flipper, spawner, cue strike | Toy prop behaviors | ✅ |
| Simulation frame hooks | `nav.session.beginFrame/flushFrame` (lab mode) | ✅ |

**Play mode** (`playMode: true`): disables selection ring overlays; used when embedding sim without full editor chrome.

Entry: `state.sandbox.controller` — selection, placement, inspectors, wire tools.

---

## Selection & inspectors

| Area | Location | Status |
|---|---|---|
| Selection model | `Libraries/Sandbox/sandboxSelection.js` | ✅ |
| Selection panel UI | `SandboxEditor/ui/sandboxSelectionPanelUi.js` | ✅ |
| Prop selected inspector | `sandboxPropSelectedInspector.js` | ✅ |
| World prop fields | `sandboxWorldPropInspector.js` | ✅ |
| Floor / belt / power | `sandboxFloorInspector.js` | ✅ |
| Wall / rail / passage / forcefield | `sandboxWallInspector.js` | ✅ |
| Shape family (ball/block spawn) | `sandboxShapeFamilyUi.js` | ✅ |
| Faction select | `sandboxUiFields.js` | ✅ |
| Chain link inspector | `appendChainLinkInspector` | ✅ |
| Button wire inspector | `appendButtonWireInspector` | ✅ |
| Room node / link corridor | `appendRoomLinkCorridorInspector` | ✅ |

Inspectors write prop/floor/wall state and should route grid edits through [grid-contract.md](../foundations/grid-contract.md).

---

## Wire tools

| Tool | File | Connects |
|---|---|---|
| Chain link wire | `chainLinkWireTool.js` | Kinetic chain members |
| Button wire | (via button inspector) | Buttons → targets |
| Room graph link wire | room graph session | Room nodes → corridor bake |

Room graph editing session: `Libraries/Sandbox/sandboxRoomGraphSession.js` — manual node placement, link wiring, bake triggers.

---

## Map generation UI

| Piece | File | Status |
|---|---|---|
| Stamp bounds | `Libraries/Sandbox/mapGenBounds.js` | ✅ |
| Map gen inspector | `mapGenInspector.js` | ✅ |
| Bounds overview editor | `Apps/Editor/ui/mapGenBoundsOverviewEditor.js` | ✅ |
| Lab map world recipes | `Apps/Editor/world/mapWorld.js` | ✅ cavern, rail DFS, etc. |

Procgen recipes stamp grid then `commitGridNavEdit`. Algorithm catalog → [Mazes.md](../Mazes.md).

---

## Overlays & debug draw

Editor/sandbox feedback uses the **overlay command pipeline** (not a fifth render pipeline):

```text
buildSandboxOverlayCommands (SandboxEditor)
  selection rings, path debug, wires, room graph, place preview
  + appLaunch.session.appendOverlayCommands (snake focused debug)
collectOverlayCommands → drawOverlayCommands
```

Snake game overlays: [games/snake.md](../games/snake.md#hud--debug-overlays).

Rendering pipeline rules: `.cursor/rules/rendering-pipelines.mdc`.

Toolbar toggles (TileLab): HPA grid, vignette, animation preview, map overview, selection rings, prop tile cells, room nodes always — `Apps/Editor/ui/shellHtml.js`.

---

## Scene persistence

| Piece | File | Status |
|---|---|---|
| Snapshot serialize/restore | `Libraries/Sandbox/sandboxSceneSnapshot.js` | ✅ |
| Scene placeables | `sandboxScenePlaceables.js` | ✅ |
| Placed spawn | `sandboxPlacedSpawn.js` | ✅ |
| Factions in snapshot | `sandboxFaction.js` | ✅ |
| JSON panel | Editor sidebar `sceneJsonPanel` | ✅ |

Persisted: props, constraints, chains, room graph, factions, visual overrides. Round-trip test still open (ROADMAP §4.5).

Game launch actions (e.g. stamp belt-crate puzzle): `Libraries/Game/gameLaunchActions.js`.

---

## Floor & mechanism systems (sandbox-owned)

These live under `Libraries/Sandbox/` and interact with the grid:

| System | Key files | Nav-aware |
|---|---|---|
| Belts | `floorOccupancy.js`, `floorBeltDefaults.js`, `conveyorDraw` | ✅ entry/exit rules |
| Buttons | `floorButtons.js`, `buttonLinks.js`, `buttonInput.js` | partial |
| Forcefields / passages | `drawForcefields.js`, `passagePowerNetwork.js`, `forcefieldPower.js` | 🟡 |
| Grid wall damage | `gridWallDamage.js` | — |
| Grid zone tick | `gridZoneTick.js` | floor subscriptions |

Partial belt resync gap → [grid-contract.md](../foundations/grid-contract.md#known-gaps--partial-resync).

---

## Viewport & lab chrome

| Piece | Path |
|---|---|
| Lab viewport + zoom/speed | `Apps/Editor/ui/labViewport.js` |
| Game viewport (fit stage) | `Apps/Editor/ui/gameViewport.js` |
| Map overview minimap | `mapOverview.js`, `mapOverviewDraw.js` |
| Profile / procedural design editor | `ui/profile/ProfileEditor.js` |
| Preview / RAF draw | `ui/preview.js` |
| World render mode toolbar | `ui/toolbar.js` |

Styles: `tilelab.css`, `game-mode.css` (snake HUD), `tilelab-map.css`.

---

## RTS-style interface (journal note)

Historical PR cluster (06/18 journal): in-game interface refactor, RTS-style selection/controls. Current state: sandbox selection + ground-nav context menu (`sandboxGroundNavContextMenu.js`) + prop behaviors cover much of “select thing → issue command.” No separate RTS doc tier — behavior lives in SandboxEditor + `groundNav/input/`.

---

## What's stub vs shipped

| Shipped | Stub / thin |
|---|---|
| Full TileLab layout, props panel, JSON export | `Libraries/Pipeline` authoring validation |
| Sandbox controller + inspectors + wire tools | Automatic behavior pick for generic props (manual behavior id) |
| Snapshot import/export | Schema round-trip test |
| Room graph editor session + corridor bake UI | Auto room-graph generator (procgen Tier 11) |
| Map gen stamp UI + lab recipes | — |
| Game shell + snake/puzzle launchers | Additional game launchers beyond snake/puzzle |

---

## Key paths

```text
Apps/Editor/
  ui/editorUi.js, mountGameShell.js, shellHtml.js, preview.js
  world/mountSandboxController.js, mapWorld.js, gameSandbox.js
Libraries/SandboxEditor/
  createSandboxController.js, buildSandboxOverlayCommands.js
  sandboxPointerGestures.js, chainLinkWireTool.js, sandboxMarqueeTool.js
  ui/*Inspector*.js
Libraries/Sandbox/
  sandboxSession.js, sandboxSelection.js, sandboxSceneSnapshot.js
  sandboxRoomGraphSession.js, groundNav/*
Libraries/Game/
  runGameLaunch.js, gameLaunchers.js, gameLaunchActions.js
```

---

## Game shell vs TileLab

When `launcher.hideEditor === true`:

- `#ui-root` gets game shell HTML (`#gameStage`, minimal toolbar)
- Canvas moves under game stage
- Snake mounts its own HUD on `#gameStage`
- Editor sidebar panels absent; world render toolbar may remain

When editing in TileLab, `state.appLaunch` is null and snake overlays only appear if a game session is mounted in lab (unusual — normal snake play uses game shell).
