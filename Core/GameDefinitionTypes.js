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
 * @typedef {object} TargetingPort
 * @property {(actor: object) => string | undefined} inferFaction
 * @property {(a: object, b: object) => boolean} areHostile
 * @property {(state: object) => object[]} getPlayerActors
 * @property {(state: object, actor: object) => object[]} getHostiles
 * @property {(state: object, source: object, range: number, excludedTargets?: Set<object> | null, opts?: { requireLos?: boolean }) => object | null} getNearestHostile
 * @property {(actor: object, target: object, state: object, range: number, blocksTargeting: boolean, opts?: { requireLos?: boolean }) => boolean} isValidTurretTarget
 */
/**
 * @typedef {object} RenderPorts
 * @property {Record<string, Function>} world3dPropRecipes
 * @property {object} kinematicsPorts
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
 * @property {(ctx: object, dt: number) => void} [runInspectorTick]
 * @property {(ctx: object) => void} [onEnter]
 * @property {(ctx: object) => void} [onInspectorEnter]
 */
/**
 * @typedef {object} UiContext
 * @property {object} state
 * @property {object[]} upgrades
 */
/**
 * @typedef {object} UiPort
 * @property {(ctx: UiContext) => void} mount
 * @property {(ctx: UiContext) => void} updateHud
 * @property {(ctx: UiContext) => void} updateUI
 */
/**
 * @typedef {object} RunBootstrapPort
 * @property {(state: object, upgrades: object[]) => void} resetRun
 */
/**
 * @typedef {object} BootstrapFeatures
 * @property {boolean} upgrades
 * @property {boolean} inspect
 * @property {boolean} save
 * @property {boolean} persistentTriggers
 */
/**
 * @typedef {object} BootstrapPort
 * @property {BootstrapFeatures} features
 */
/**
 * @typedef {object} RunSceneCapabilities
 * @property {boolean} horde
 * @property {boolean} blockTurret
 */
/**
 * @typedef {object} RunScenePort
 * @property {import("../Libraries/RunScene/runScenePorts.js").RunScenePorts} ports
 * @property {(state: object) => object | null} getLayout
 * @property {(ctx: object) => void} onSimulationEnter
 * @property {(ctx: object, dt: number) => void} onTick
 * @property {(state: object) => RunSceneCapabilities} getCapabilities
 * @property {(payload: { enemy: object, state: object, upgrades: object[], fsm: object }) => void} [onEnemyKilled]
 */
/**
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} WorldPlayBounds
 */
/**
 * World bootstrap port — compose via `createWorldGenPort(phases, …)` or presets
 * (`createSingleArenaWorldGenPort`, `createRoguelikeMapWorldGenPort`) in `Libraries/WorldGen/`.
 *
 * @typedef {object} WorldGenPort
 * @property {(state: object) => void} generateWorld — build walls, bounds, and surface caches for a new run
 * @property {(state: object) => WorldPlayBounds | null} getPlayBounds — clip rendering/surfaces to playable area
 * @property {(state: object) => { centerX: number, centerY: number, width: number, height: number } | null} [getObstacleGridBounds] — exact nav/surface grid (skips spatialWorldMargin)
 * @property {number} [nodeWorldCoordScale] — roguelike map: graph node units → world units
 * @property {number} [startMapNodeId] — map graph node used for opening layout (default 0)
 * @property {string} [startNodeStrategyKey] — roguelike-map: key in strategies for node-0 room bake
 * @property {string} [startNodeStrategyLabel] — display label stored on the map node
 * @property {Record<string, WorldGenStrategy>} [strategies] — merged into the generator lookup table
 * @property {(px: number, py: number, cellSize: number) => StartLayout} getStartLayout
 * @property {boolean} [skipStartPickups] — omit crate/barrel scatter on map reset
 */
/**
 * @typedef {object} InspectPort
 * @property {() => void} [registerEntries]
 * @property {(state: object) => { show: boolean, text: string }} getMissionBanner
 * @property {(state: object, worldX: number, worldY: number) => object | null} findPickup
 * @property {(state: object, inspectKey: string) => void} onMissionOpen
 * @property {(state: object, inspectKey: string) => void} onMissionClose
 * @property {(state: object) => boolean} isMissionActive
 */
/**
 * @typedef {object} CombatPort
 * @property {(ctx: { state: object, upgrades: object[] }) => void} [onRunOpeningComplete]
 */
/**
 * @typedef {object} RadioPort
 * @property {(eventBus: object, pauseApi: { requestPause: (reason: string) => void, requestResume: (reason: string) => void }) => void} [wire]
 * @property {() => boolean} isDialogActive
 */
/**
 * @typedef {object} OutcomePort
 * @property {(state: object) => "won" | "lost" | null} getRunOutcome
 */
/**
 * @typedef {import("./GameUiProfile.js").GameUiProfile} GameUiProfile
 */
/**
 * @typedef {import("./GamePerspective.js").PerspectiveConfig} PerspectiveConfig
 */
/**
 * @typedef {object} GameDefinition
 * @property {string} id
 * @property {string} canvasId
 * @property {string} [saveKey]
 * @property {() => object[]} createUpgrades
 * @property {Record<string, new () => object>} states
 * @property {string} initialState
 * @property {Partial<InteractionPairsPort>} [interactionPairs] — combat/physics overrides; physics defaults from engine
 * @property {SimulationPort} simulationPort — phase pipeline (`runTick`, `onEnter`, …)
 * @property {UiPort} uiPort — DOM chrome mount + HUD/panel updates
 * @property {TargetingPort} targeting
 * @property {RenderPorts} render
 * @property {WorldGenPort} worldGen
 * @property {RunBootstrapPort} runBootstrapPort — new-run entity/world setup after `generateWorld`
 * @property {BootstrapPort} bootstrapPort — feature-gated `createGame` boot
 * @property {RunScenePort} runScenePort — run scene enter/tick/capabilities
 * @property {InspectPort} inspectPort — inspect mission hooks + catalog registration
 * @property {CombatPort} combatPort — run-opening combat setup
 * @property {RadioPort} radioPort — boot wiring + dialog input guards
 * @property {OutcomePort} outcomePort — custom win/loss detection (health-based games use noop)
 * @property {() => void | Promise<void>} [prepare]
 * @property {Partial<import("./GameUiProfile.js").GameUiProfile>} [ui]
 * @property {Partial<import("./GamePerspective.js").PerspectiveConfig>} [perspective]
 * @property {number} [propPixelSize] — target bake diameter for small props; large props auto-match world size
 * @property {Partial<import("./GameProceduralDesign.js").ProceduralDesignConfig>} [proceduralDesign]
 * @property {Partial<import("../Libraries/WorldSurface/worldSurfaceDefaults.js").LibraryWorldSurfaceDefaults> & { cameraHeight?: number, cellSize?: number, floorShadow?: string }} [worldSurface] — partial overrides on library world-surface defaults
 * @property {Partial<import("../Libraries/Collision/collisionDefaults.js").LibraryCollisionSettings>} [collisionSettings] — partial overrides on library collision defaults
 * @property {Partial<import("../Libraries/Props/propRenderDefaults.js").LibraryPropQuantizeSteps>} [propQuantizeSteps] — partial overrides on library prop facing/roll steps
 */
export {};
