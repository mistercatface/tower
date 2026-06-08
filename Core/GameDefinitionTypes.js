/**
 * @typedef {import("../Libraries/Interaction/pairRules.js").PairFilterConfig} PairFilterConfig
 */
/**
 * @typedef {object} InteractionPairsPort
 * @property {PairFilterConfig} separation
 * @property {PairFilterConfig} actorPushable
 * @property {PairFilterConfig} pushable
 * @property {PairFilterConfig} pushableSleepBlocker
 * @property {PairFilterConfig} combatant
 * @property {PairFilterConfig} chargeImpact
 * @property {PairFilterConfig} projectileHitActor
 * @property {PairFilterConfig} projectileHitPickup
 */
/**
 * World-space focus for kinematics tilt and simulation LOD (not necessarily a playable actor).
 *
 * @typedef {object} ViewPort
 * @property {(state: object) => { x: number, y: number } | null} getViewCenter
 */
/**
 * @typedef {object} TargetingPort
 * @property {(actor: object) => string | undefined} inferFaction
 * @property {(a: object, b: object) => boolean} areHostile
 * @property {(state: object) => object[]} getPlayerActors
 * @property {(state: object) => object[]} getBroadphaseActors — actors in collision broadphase; `[]` for prop-only games
 * @property {(state: object, actor: object) => object[]} getHostiles
 * @property {(state: object, source: object, range: number, excludedTargets?: Set<object> | null, opts?: { requireLos?: boolean }) => object | null} getNearestHostile
 * @property {(actor: object, target: object, state: object, range: number, blocksTargeting: boolean, opts?: { requireLos?: boolean }) => boolean} isValidTurretTarget
 */
/**
 * @typedef {object} SimulationEffectPass
 * @property {number} zIndex
 * @property {(state: object, viewport: object, ctx: CanvasRenderingContext2D, renderer?: import("../Render/Render.js").Renderer) => void} draw
 */
/**
 * @typedef {object} RenderPorts
 * @property {Record<string, Function>} world3dPropRecipes
 * @property {object} kinematicsPorts
 * @property {import("../Libraries/Render/worldStructure/LiveWorldStructure.js").WorldStructurePort} worldStructure
 * @property {SimulationEffectPass[]} [simulationEffectPasses]
 * @property {(state: object, viewport: object, ctx: CanvasRenderingContext2D, renderer: import("../Render/Render.js").Renderer) => void} [drawPostSimulation]
 */
/**
 * @typedef {object} WorldGenStrategy
 * @property {(state: object, px: number, py: number) => void} generate
 */
/**
 * @typedef {object} StartLayout
 * @property {number} spawnX
 * @property {number} spawnY
 * @property {number} [spawnClearRadius]
 * @property {number} [guardFaceX]
 * @property {number} [guardFaceY]
 * @property {Record<string, { x: number, y: number }>} [spawnSlots]
 */
/**
 * @typedef {object} SimulationPort
 * @property {(ctx: object, dt: number) => void} runTick
 * @property {(ctx: object) => void} [onEnter]
 * @property {import("../../Systems/Simulation/SimulationPipeline.js").SimulationPhase[]} [phases] — used by feature merging
 * @property {(ctx: object) => import("../../Systems/Simulation/SimulationRuntime.js").SimulationRuntime} [beginRuntime]
 */
/**
 * @typedef {object} UiContext
 * @property {object} state
 */
/**
 * @typedef {object} UiPort
 * @property {(ctx: UiContext) => void} mount
 * @property {() => void} [unmount]
 * @property {(ctx: UiContext) => void} updateHud
 * @property {(ctx: UiContext) => void} updateUI
 */
/**
 * @typedef {object} RunBootstrapPort
 * @property {(state: object) => void} resetRun
 */
/**
 * @typedef {object} InputPort
 * @property {(delta: number) => void} [onWheelZoomDelta]
 * @property {(zoom: number) => void} [onPinchZoom]
 */
/**
 * @typedef {object} RunScenePort
 * @property {(state: object) => object | null} getLayout
 * @property {(ctx: object) => void} onSimulationEnter
 * @property {(ctx: object, dt: number) => void} onTick
 * @property {(payload: { enemy: object, state: object, fsm: object }) => void} [onEnemyKilled]
 */
/**
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} WorldPlayBounds
 */
/**
 * World bootstrap port — compose via `createWorldGenPort(phases, …)` or presets
 * (`createSingleArenaWorldGenPort`, `createRoguelikeWorldGenPort`) in `Libraries/WorldGen/`.
 *
 * @typedef {object} WorldGenPort
 * @property {(state: object) => void} generateWorld — build walls, bounds, and surface caches for a new run
 * @property {(state: object) => WorldPlayBounds | null} getPlayBounds — clip rendering/surfaces to playable area
 * @property {(state: object) => { centerX: number, centerY: number, width: number, height: number } | null} [getObstacleGridBounds] — exact nav/surface grid (skips spatialWorldMargin)
 * @property {number} [nodeWorldCoordScale] — roguelike map: graph node units → world units
 * @property {number} [startMapNodeId] — map graph node used for default spawn layout (default 0)
 * @property {(px: number, py: number, cellSize: number) => StartLayout} getStartLayout
 * @property {boolean} [skipStartPickups] — omit crate/barrel scatter on map reset
 */
/**
 * @typedef {object} CombatPort
 * @property {(ctx: { state: object }) => void} [onRunOpeningComplete]
 */
/**
 * @typedef {object} PlaybackConfig
 * @property {number} [minSpeed]
 * @property {number} [maxSpeed]
 * @property {number} [step]
 */
/**
 * @typedef {import("./GamePerspective.js").PerspectiveConfig} PerspectiveConfig
 */
/**
 * @typedef {object} GameFeature
 * @property {(state: object) => void} [initState]
 * @property {(eventBus: import("../Libraries/Events/EventBus.js").EventBus, boot?: { state: object, fsm: import("../Libraries/FSM/StateMachine.js").StateMachine, resetGame: () => void }) => void} [registerListeners]
 * @property {import("../../Systems/Simulation/SimulationPipeline.js").SimulationPhase[]} [simulationPhases]
 * @property {string} [simulationPhaseInsertAfter] — splice after a base phase `id`; append when omitted
 * @property {SimulationEffectPass[]} [simulationEffectPasses]
 * @property {(state: object, viewport: object, ctx: CanvasRenderingContext2D, renderer: import("../Render/Render.js").Renderer) => void} [drawPostSimulation]
 */
/**
 * @typedef {object} GameDefinition
 * @property {string} id
 * @property {string} canvasId
 * @property {GameFeature[]} [features]
 * @property {string} [saveKey]
 * @property {() => import("../GameState/SharedGameState.js").SharedGameState} createGameState
 * @property {(eventBus: import("../Libraries/Events/EventBus.js").EventBus, boot?: { state: object, fsm: import("../Libraries/FSM/StateMachine.js").StateMachine, resetGame: () => void }) => void} [registerListeners]
 * @property {Record<string, new () => object>} states
 * @property {string} initialState
 * @property {Partial<InteractionPairsPort>} [interactionPairs] — combat/physics overrides; physics defaults from engine
 * @property {SimulationPort} simulationPort — phase pipeline (`runTick`, `onEnter`, …)
 * @property {UiPort} uiPort — DOM chrome mount + HUD/panel updates
 * @property {TargetingPort} [targeting] — defaults to noop when omitted
 * @property {ViewPort} [viewPort] — defaults to noop when omitted
 * @property {RenderPorts} render
 * @property {WorldGenPort} worldGen
 * @property {RunBootstrapPort} runBootstrapPort — new-run entity/world setup after `generateWorld`
 * @property {InputPort} [input] — optional canvas zoom/pinch hooks
 * @property {(phase: string) => boolean} [isWorldScene] — 3D world draw eligibility; defaults to simulation phase only
 * @property {RunScenePort} runScenePort — simulation enter/tick/layout hooks
 * @property {CombatPort} [combatPort] — defaults to noop when omitted
 * @property {(fsm: import("../Libraries/FSM/StateMachine.js").StateMachine) => import("../Libraries/Input/keyboardBindings.js").KeyBinding[]} [keyBindings]
 * @property {() => void} [onCanvasResize]
 * @property {() => void | Promise<void>} [prepare]
 * @property {{ actorCache?: import("../Libraries/Canvas/SpriteCache.js").SpriteCache, turretCache?: import("../Libraries/Canvas/SpriteCache.js").SpriteCache }} [caches]
 * @property {Partial<import("./GamePerspective.js").PerspectiveConfig>} [perspective]
 * @property {number} [propPixelSize] — target bake diameter for small props; large props auto-match world size
 * @property {Partial<import("./GameProceduralDesign.js").ProceduralDesignConfig>} [proceduralDesign]
 * @property {Partial<import("../Libraries/WorldSurface/worldSurfaceDefaults.js").LibraryWorldSurfaceDefaults> & { cameraHeight?: number, cellSize?: number, floorShadow?: string }} [worldSurface] — partial overrides on library world-surface defaults
 * @property {Partial<import("../Libraries/Collision/collisionDefaults.js").LibraryCollisionSettings>} [collisionSettings] — partial overrides on library collision defaults
 * @property {Partial<import("../Libraries/Props/propRenderDefaults.js").LibraryPropQuantizeSteps>} [propQuantizeSteps] — partial overrides on library prop facing/roll steps
 * @property {PlaybackConfig} [playback] — simulation speed cap/step; tower uses upgrade stat when omitted
 */
export {};
