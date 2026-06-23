/**
 * STUPID SHIT AUDIT
 *
 * Model fix (prop draw recipes, 2025-06 session):
 *   - worldPropRecipes exported from PropCatalog — import at lookup sites
 *   - deleted PropRenderer.js + class + constructor instance
 *   - removed propRecipes param from drawCachedPropSprite / renderer / frame paths
 *   - deleted getWorldPropRecipes()
 *
 * Rule of thumb: browser game. Hard refresh = clean slate. Static data is ESM imports.
 * Never thread startup catalogs through constructors, draw passes, getters, or "load" calls.
 *
 * See also: .cursor/rules/browser-static-catalog.mdc
 */
/** What we fixed — copy this pattern everywhere below. */
export const MODEL = {
    before: [
        "Instanced catalog on Renderer / PropRenderer",
        "propRecipes threaded through drawCachedPropSprite, WorldSceneRenderer, Render.js",
        "getWorldPropRecipes() getter",
        "loadPropAssets() boot call before engine (main.js dynamic import chain)",
    ],
    after: [
        "export const worldPropRecipes = {} — filled once, same object reference",
        "export const worldPropAssets / worldPropDefinitions — same pattern",
        "import { worldPropRecipes } where lookup happens",
        "WorldSceneRenderer._drawProp → drawCachedPropSprite directly",
        "No loadPropAssets(), no getPropAsset(), no getWorldPropDefinitions()",
        "main.js static imports — no boot chain",
    ],
    notStupid: [
        "Per-frame sim state (entityRegistry, obstacleGrid, viewport) — that actually changes",
        "Persistence boundaries (save/load, debounced storage)",
        "Worker SAB / nav topology — runtime alloc, not static catalog",
    ],
};
/**
 * @typedef {Object} StupidItem
 * @property {string} id
 * @property {"done"|"p0"|"p1"|"p2"|"p3"|"p4"} priority
 * @property {string} title
 * @property {string} stupid — what the AI keeps doing and why it's dumb here
 * @property {string} fix — concrete collapse
 * @property {string[]} files — primary touch points
 * @property {number} [callSites] — grep order-of-magnitude
 */
/** @type {StupidItem[]} */
export const ITEMS = [
    // ─── DONE (reference) ───────────────────────────────────────────────────
    {
        id: "DONE-1",
        priority: "done",
        title: "propRecipes threaded + PropRenderer class",
        stupid: "Startup draw map passed as ctor arg / fn param / getter through render stack.",
        fix: "worldPropRecipes import at bake/draw sites. Deleted PropRenderer.js.",
        files: ["Libraries/Render/Props3D/PropRenderer.js (deleted)", "Libraries/Render/WorldSceneRenderer.js", "Libraries/Canvas/QuantizedSpriteCache.js", "Render/Render.js"],
    },
    // ─── P0 — prop catalog still pretending to "load" ───────────────────────
    {
        id: "P0-1",
        priority: "done",
        title: "loadPropAssets() + main.js import chain",
        stupid: '"Load" props before engine. Everything is already static imports in Assets/props/index.js. Not fetching anything.',
        fix: "Move assetToDefinition + registerPropDraw loop to module top-level in PropCatalog.js (or colocate with Assets/props/index.js). Delete loadPropAssets.js. main.js imports engine directly — no .then(loadPropAssets).",
        files: ["Libraries/Props/loadPropAssets.js", "main.js", "Libraries/Props/PropCatalog.js"],
        callSites: 55,
    },
    {
        id: "P0-2",
        priority: "done",
        title: "getPropAsset() / getWorldPropDefinitions() getters",
        stupid: "Same pattern as getWorldPropRecipes — indirection over module-level maps filled once at boot.",
        fix: "export const worldPropAssets = {} and worldPropAssets[id] at use sites. export const worldPropDefinitions = {} for strategy lookup. Delete getters; keep format* helpers only if they add string logic.",
        files: ["Libraries/Props/PropCatalog.js", "Entities/WorldProp.js"],
        callSites: 45,
    },
    {
        id: "P0-3",
        priority: "done",
        title: "setPropCatalog() mutable registry",
        stupid: "Runtime catalog mutation API for a browser game that refreshes on every code change.",
        fix: "Module-init fills exported records. Keep setPropCatalog ONLY in tests/lockedRoomHarness.js for minimal two-prop subset — or import ball/button assets directly in that harness and skip registry entirely.",
        files: ["Libraries/Props/PropCatalog.js", "tests/lockedRoomHarness.js"],
    },
    {
        id: "P0-4",
        priority: "done",
        title: "registerPropDraw copies asset.draw",
        stupid: "For assets with draw: on module, loadPropAssets does recipes[id] = asset.draw — pure copy into second map.",
        fix: "Either put resolved draw on each asset at asset module init (primitive: export draw = builder(visuals)) OR build worldPropRecipes once in PropCatalog import — not a named load function.",
        files: ["Libraries/Props/loadPropAssets.js", "Assets/props/**/*.asset.js"],
    },
    {
        id: "P0-5",
        priority: "done",
        title: "55× loadPropAssets() in tests",
        stupid: "Every test file manually bootstraps catalog that should exist on first PropCatalog import.",
        fix: "Delete all loadPropAssets() calls once P0-1 lands. Tests import PropCatalog or spawn props — nothing else.",
        files: ["tests/**/*.test.js", "tests/harness/snakeGameHarness.js"],
        callSites: 55,
    },
    // ─── P1 — boot singleton / install / apply theater ──────────────────────
    {
        id: "P1-1",
        priority: "done",
        title: "gameWorldSurfaceSettings lazy singleton",
        stupid: "let gameWorldSurfaceSettings = null; get() auto-creates if missing. Settings come from Config/world.js — static after installEditorDefaults.",
        fix: "export const gameWorldSurfaceSettings = createGameWorldSurfaceSettings(...) from Render/WorldSurfaceBootstrap.js after one install call, OR import merged settings from Config directly. Delete lazy null branch.",
        files: ["Render/WorldSurfaceBootstrap.js", "Render/Render.js", "Core/engineGlobals.js"],
        callSites: 15,
    },
    {
        id: "P1-2",
        priority: "done",
        title: "SurfaceProfileProvider class + getSurfaceProfileProvider()",
        stupid: "Class registry + activeProvider singleton + install/get throws. Shipped profiles already exported as surfaceProceduralProfiles in Config/procedural/profiles.js.",
        fix: "export const surfaceProfiles = surfaceProceduralProfiles; export let defaultSurfaceProfileId; import profiles[id] at bake/draw sites. Runtime registerRuntime() only if editor actually adds profiles mid-session (verify — probably not; refresh).",
        files: ["Libraries/Procedural/SurfaceProfileProvider.js", "Config/procedural/bootstrap.js", "Config/procedural/profiles.js", "Core/engineGlobals.js", "Render/WorldSurface/TileWorkerEntry.js"],
        callSites: 20,
    },
    {
        id: "P1-3",
        priority: "done",
        title: "installGameSurfaceProfileProvider wrapper",
        stupid: "Thin wrapper around installSurfaceProfileProvider that reads game definition — one more boot hop.",
        fix: "engineGlobals.installEditorDefaults writes defaultSurfaceProfileId + uses static profile map directly.",
        files: ["Config/procedural/bootstrap.js", "Core/engineGlobals.js"],
    },
    {
        id: "P1-4",
        priority: "done",
        title: "applyGame* / getCollisionSettings / getPhysicsSettings / getActivePerspective",
        stupid: "Parallel pattern: let activeX; applyGameX at boot; getX() on every hot read. Same as prop catalog getters.",
        fix: "export let collisionSettings (or export const after installEditorDefaults merges once). Import collisionSettings.kineticIterations — no getter. One boot merge in engineGlobals, not scattered get() calls.",
        files: [
            "Libraries/Collision/collisionDefaults.js",
            "Libraries/Motion/physicsDefaults.js",
            "Core/GamePerspective.js",
            "Core/GamePropPixelSize.js",
            "Libraries/Props/propRenderDefaults.js",
            "Core/engineGlobals.js",
        ],
        callSites: 40,
    },
    {
        id: "P1-5",
        priority: "done",
        title: "installEditorDefaults(state) writes 8 module globals",
        stupid: "Single function that mutates half the engine via apply/install pairs — hideous boot orchestration that exists because nothing is just imported.",
        fix: "After collapsing P1-*: engine.js imports Config + merged exports; installEditorDefaults shrinks to worker URL + state.worldSurfaces.settings assign only (true runtime wiring).",
        files: ["Core/engineGlobals.js", "Apps/Editor/engine.js"],
    },
    // ─── P2 — render "context" bags and pass factories ──────────────────────
    {
        id: "P2-1",
        priority: "p2",
        title: "Renderer.worldSceneDrawInput + syncWorldSceneDrawInput",
        stupid: "Mutable bag on Renderer; every frame repoints entityRegistry, spatialFrame, grid, gameState from state. Extra indirection — draw methods could take state + viewport.",
        fix: "drawDebrisProps(ctx, state, viewport) — read state.entityRegistry inside WorldSceneRenderer. Delete worldSceneDrawInput object and sync fn.",
        files: ["Render/Render.js", "Libraries/Render/WorldSceneRenderer.js", "Render/StructureDrawPass.js"],
    },
    {
        id: "P2-2",
        priority: "p2",
        title: "proceduralSurfaceDraw nested object with resolveProfileAt method",
        stupid: "Object on draw input with boundGameState + method closure — fake mini-service inside draw bag.",
        fix: "resolveSurfaceProfileAtCoords(state, x, y) at wall bake call sites; pass surfaceSeed/override as scalars if needed.",
        files: ["Render/Render.js", "Libraries/Render/WorldSceneTypes.js", "Render/game/surfaceProfileResolver.js"],
    },
    {
        id: "P2-3",
        priority: "p2",
        title: "createStructureDrawPass(mode, renderer) factory",
        stupid: "Returns { draw: fn } wrapper that only calls renderer.render3D.draw3DBuildings + one worldSurfaces call. Two nearly identical objects.",
        fix: "Renderer.drawWorldSceneStructure switches on mode inline — two methods or if/else, no StructureDrawPass typedef factory file.",
        files: ["Render/StructureDrawPass.js", "Render/Render.js"],
    },
    {
        id: "P2-4",
        priority: "p2",
        title: "wallCtx 15-field bag + _bindWallDrawable per drawable",
        stupid: "Separate frame dialect for walls vs props. Mutate wallCtx fields for every wall/rail in sort loop.",
        fix: "WorldSceneDrawPass (frame.md): one camera struct; wall draw reads pass + small per-drawable scratch. Collapse wallPassCamera into pass.",
        files: ["Libraries/Render/WorldSceneRenderer.js", "Libraries/Render/Structure3D/ProjectedWallDraw.js", "Libraries/Render/Structure3D/StaticGridEdgeRailDraw.js", "Plans/current/frame.md"],
    },
    {
        id: "P2-5",
        priority: "p2",
        title: "px / py / zoom extracted in every draw method",
        stupid: "const px = viewport.x repeated 4+ times per frame across debris/floor/3D/overlays.",
        fix: "WorldSceneDrawPass filled once per sub-pass (_beginDrawPass). drawCachedPropSprite reads pass at single boundary — recipes stay (ctx, prop, px, py).",
        files: ["Libraries/Render/WorldSceneRenderer.js", "Libraries/Sandbox/gridStampDrawCache.js", "Libraries/Render/overlays/drawOverlayCommands.js"],
    },
    {
        id: "P2-6",
        priority: "p2",
        title: "WorldSceneRenderer(settings) ctor param",
        stupid: "Passes gameWorldSurfaceSettings into renderer ctor — static config as instance field.",
        fix: "import { gameWorldSurfaceSettings } from WorldSurfaceBootstrap (or Config) inside draw methods that need floorShadow / wall tuning.",
        files: ["Libraries/Render/WorldSceneRenderer.js", "Render/Render.js"],
    },
    // ─── P3 — asset lookup in hot paths / duplicate catalogs ────────────────
    {
        id: "P3-1",
        priority: "p3",
        title: "getPropAsset(prop.type) in draw bake (polygonPrimitive)",
        stupid: "Hot draw closure calls getter for footprint fallback every bake miss.",
        fix: "worldPropAssets[prop.type] import, or store needed physics fields on prop.strategy at spawn (already mostly there).",
        files: ["Libraries/Props/primitives/polygonPrimitive.js", "Libraries/Render/Props3D/pipeElbow.js", "Libraries/Render/Props3D/flipperPaddle.js"],
    },
    {
        id: "P3-2",
        priority: "p3",
        title: "Assets/props/index.js default export AND PropCatalog assetsById",
        stupid: "Same prop objects in two maps — index.js catalog + loadPropAssets copies to assetsById.",
        fix: "One source: import propCatalog from Assets/props/index.js everywhere, OR export worldPropAssets built from that import once. Not both.",
        files: ["Assets/props/index.js", "Libraries/Props/PropCatalog.js", "Libraries/Props/loadPropAssets.js"],
    },
    {
        id: "P3-3",
        priority: "p3",
        title: "buildWorldPropStrategy via getWorldPropDefinitions()[type]",
        stupid: "Derived definition map separate from asset.physics — duplicate of assetToDefinition strip logic.",
        fix: "WorldProp constructor imports asset, builds strategy from asset.physics inline (same destructuring as assetToDefinition). Delete definitions map if nothing else needs it.",
        files: ["Entities/WorldProp.js", "Libraries/Props/propVisualAttachments.js", "Libraries/Sandbox/spawnerConfig.js"],
    },
    {
        id: "P3-4",
        priority: "p3",
        title: "drawForcefields.js not on gridStampDrawCache pattern",
        stupid: "Separate collect + draw path with proxy proto; belts/power already unified in gridStampDrawCache.",
        fix: "gamechangers.md G1 — merge forcefield stamps into gridStampDrawCache.js, same as floor belts.",
        files: ["Libraries/Sandbox/drawForcefields.js", "Libraries/Sandbox/gridStampDrawCache.js", "Plans/current/gamechangers.md"],
    },
    // ─── P4 — thin getters, dead files, test harness duplication ──────────
    {
        id: "P4-1",
        priority: "p4",
        title: "getGameLauncher(launchId)",
        stupid: "Getter over GAME_LAUNCHERS record — identical to deleted getWorldPropRecipes.",
        fix: "GAME_LAUNCHERS[launchId] with throw at call site, or export lookup inline in engine.js.",
        files: ["Libraries/Game/gameLaunchers.js", "Apps/Editor/engine.js"],
    },
    {
        id: "P4-2",
        priority: "p4",
        title: "lockedRoomHarness ensurePropCatalog duplicate",
        stupid: "Reimplements assetDefinition + setPropCatalog + propsLoaded guard — copy of loadPropAssets for two props.",
        fix: "Import ball + button_floor assets directly; build minimal maps inline once, or use full module-init catalog.",
        files: ["tests/lockedRoomHarness.js"],
    },
    {
        id: "P4-3",
        priority: "p4",
        title: "Ghost drawWorldProp.js (rg index, file missing)",
        stupid: "Stale reference to drawWorldProp(ctx, prop, viewport, drawContext) with propRenderer in context — pre-cleanup artifact.",
        fix: "Confirm deleted from git; grep clean. Do not recreate.",
        files: ["Libraries/Render/drawWorldProp.js"],
    },
    {
        id: "P4-4",
        priority: "p4",
        title: "createSandboxController spawnAsset = () => getPropAsset(...)",
        stupid: "Closure factory returning getter call — use worldPropAssets[session.getSpawnPropId()] at use sites.",
        files: ["Libraries/SandboxEditor/createSandboxController.js"],
    },
    {
        id: "P4-5",
        priority: "p4",
        title: "resolveSandboxBehaviors(asset, registeredBehaviors, state, prop)",
        stupid: "Behavior registry passed through editor tools; asset.sandbox.behaviors already on static asset.",
        fix: "Import behavior modules directly; filter asset.sandbox.behaviors against static BEHAVIOR_BY_ID map exported from one module — no registeredBehaviors param threading.",
        files: ["Libraries/Sandbox/sandboxCapabilities.js", "Libraries/SandboxEditor/createSandboxController.js"],
    },
    // ─── P4 — barrels still importing through index ─────────────────────────
    {
        id: "P4-6",
        priority: "p4",
        title: "Libraries/Pause/index.js (and other one-export barrels)",
        stupid: "import { PauseManager } from Pause/index.js — passthrough catalog.",
        fix: "import from PauseManager.js directly (minimal-barrels.mdc). Audit Libraries/*/index.js — delete unused barrels.",
        files: ["Libraries/Pause/index.js", "Apps/Editor/engine.js"],
    },
];
/** Suggested knock-down order — each item should shrink files/params/objects like DONE-1. */
export const ORDER = ["P2-1", "P2-3", "P2-5", "P2-4", "P3-2", "P3-3", "P3-4", "P4-1"];
/** Grep helpers (run after fixes to verify shrinkage). */
export const VERIFY = {
    loadPropAssets: "rg loadPropAssets",
    getPropAsset: "rg 'getPropAsset\\('",
    getWorldPropDefinitions: "rg getWorldPropDefinitions",
    getGameLauncher: "rg getGameLauncher",
    getSurfaceProfileProvider: "rg getSurfaceProfileProvider",
    getCollisionSettings: "rg getCollisionSettings",
    PropRenderer: "rg PropRenderer",
    propRecipes: "rg propRecipes",
};
