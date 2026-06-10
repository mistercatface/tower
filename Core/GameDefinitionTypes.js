/**
 * JSDoc types for the editor engine profile (render/sim/world-gen hooks).
 * Shared engine code reads the installed profile via `Apps/Editor/engine.js`.
 */
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
 * @property {SimulationEffectPass[]} [simulationEffectPasses]
 * @property {(state: object, viewport: object, ctx: CanvasRenderingContext2D) => void} [drawGroundOverlays]
 * @property {(state: object, viewport: object, ctx: CanvasRenderingContext2D, renderer: import("../Render/Render.js").Renderer) => void} [drawPostSimulation]
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
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} WorldPlayBounds
 */
/**
 * @typedef {object} WorldGenPort
 * @property {(state: object) => void} generateWorld
 * @property {(state: object) => WorldPlayBounds | null} getPlayBounds
 * @property {number} nodeWorldCoordScale
 * @property {number} [startMapNodeId]
 * @property {(px: number, py: number, cellSize: number) => StartLayout} getStartLayout
 * @property {boolean} [skipStartPickups]
 * @property {Record<string, import("./GameDefinitionTypes.js").WorldGenStrategy>} [strategies]
 */
/**
 * @typedef {object} WorldGenStrategy
 * @property {(state: object, px: number, py: number) => void} generate
 */
/**
 * @typedef {object} PlaybackConfig
 * @property {number} [minSpeed]
 * @property {number} [maxSpeed]
 * @property {number} [step]
 */
/**
 * @typedef {object} PlaybackHandlers
 * @property {() => void} togglePause
 * @property {(delta: number) => void} adjustSpeed
 */
/**
 * @typedef {import("./GamePerspective.js").PerspectiveConfig} PerspectiveConfig
 */
/**
 * Editor engine profile (`engine` in Apps/Editor/engine.js).
 *
 * @typedef {object} EngineProfile
 * @property {string} id
 * @property {Partial<InteractionPairsPort>} interactionPairs
 * @property {TargetingPort} targeting
 * @property {ViewPort} viewPort
 * @property {RenderPorts} render
 * @property {WorldGenPort} worldGen
 * @property {() => void} [onCanvasResize]
 * @property {() => void | Promise<void>} [prepare]
 * @property {{ actorCache?: import("../Libraries/Canvas/SpriteCache.js").SpriteCache, turretCache?: import("../Libraries/Canvas/SpriteCache.js").SpriteCache }} [caches]
 * @property {Partial<import("./GamePerspective.js").PerspectiveConfig>} [perspective]
 * @property {number} [propPixelSize]
 * @property {Partial<import("./GameProceduralDesign.js").ProceduralDesignConfig>} [proceduralDesign]
 * @property {Partial<import("../Libraries/WorldSurface/worldSurfaceDefaults.js").LibraryWorldSurfaceDefaults> & { cameraHeight?: number, cellSize?: number, floorShadow?: string }} [worldSurface]
 * @property {Partial<import("../Libraries/Collision/collisionDefaults.js").LibraryCollisionSettings>} [collisionSettings]
 * @property {Partial<import("../Libraries/Props/propRenderDefaults.js").LibraryPropQuantizeSteps>} [propQuantizeSteps]
 * @property {PlaybackConfig} [playback]
 * @property {PlaybackHandlers} playbackHandlers
 */
export {};
