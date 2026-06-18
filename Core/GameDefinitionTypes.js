/**
 * JSDoc types for the editor engine profile (render/sim/world-gen hooks).
 * Module globals for collision, perspective, procedural design, and world surface are set at editor boot via `installEditorDefaults`.
 */
/**
 * @typedef {import("../Libraries/Interaction/pairRules.js").PairFilterConfig} PairFilterConfig
 */
/**
 * @typedef {object} InteractionPairsPort
 * @property {PairFilterConfig} kineticSleepBlocker
 */
/**
 * @typedef {object} SimulationEffectPass
 * @property {number} zIndex
 * @property {(state: object, viewport: object, ctx: CanvasRenderingContext2D, renderer?: import("../Render/Render.js").Renderer) => void} draw
 */
/**
 * @typedef {object} RenderPorts
 * @property {Record<string, Function>} world3dPropRecipes
 * @property {SimulationEffectPass[]} [simulationEffectPasses]
 * @property {(state: object, viewport: object, ctx: CanvasRenderingContext2D) => void} [drawGroundOverlays]
 * @property {(state: object, viewport: object, ctx: CanvasRenderingContext2D, renderer: import("../Render/Render.js").Renderer) => void} [drawPostSimulation]
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
 * @property {RenderPorts} render
 * @property {() => void} [onCanvasResize]
 * @property {() => void | Promise<void>} [prepare]
 * @property {Partial<import("./GamePerspective.js").PerspectiveConfig>} [perspective]
 * @property {number} [propPixelSize]
 * @property {Partial<import("./GameProceduralDesign.js").ProceduralDesignConfig>} [proceduralDesign]
 * @property {Partial<import("../Config/world.js").WorldSurfaceDefaults> & { cellSize?: number, floorShadow?: string }} [worldSurface]
 * @property {Partial<import("../Libraries/Collision/collisionDefaults.js").LibraryCollisionSettings>} [collisionSettings]
 * @property {Partial<import("../Libraries/Props/propRenderDefaults.js").LibraryPropQuantizeSteps>} [propQuantizeSteps]
 * @property {PlaybackConfig} [playback]
 * @property {PlaybackHandlers} playbackHandlers
 */
export {};
