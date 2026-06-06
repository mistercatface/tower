/**
 * @typedef {import("../Libraries/Interaction/pairRules.js").PairFilterConfig} PairFilterConfig
 */

/**
 * @typedef {object} CombatPairsPort
 * @property {PairFilterConfig} separation
 * @property {PairFilterConfig} chargeImpact
 * @property {PairFilterConfig} projectileHitActor
 * @property {PairFilterConfig} projectileHitPickup
 * @property {PairFilterConfig} combatant
 * @property {PairFilterConfig} actorPushable
 * @property {PairFilterConfig} pushable
 * @property {PairFilterConfig} pushableSleepBlocker
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
 * @typedef {object} WorldGenPort
 * @property {number} [startMapNodeId] — map graph node used for opening layout (default 0)
 * @property {string} startNodeStrategyKey — key in strategies for node-0 wall generation
 * @property {string} [startNodeStrategyLabel] — display label stored on the map node
 * @property {Record<string, WorldGenStrategy>} strategies — merged into the generator lookup table
 * @property {(px: number, py: number, cellSize: number) => StartLayout} getStartLayout
 * @property {boolean} [skipStartPickups] — omit crate/barrel scatter on map reset
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
 * @property {CombatPairsPort} combatPairs
 * @property {TargetingPort} targeting
 * @property {RenderPorts} render
 * @property {WorldGenPort} worldGen
 * @property {() => void | Promise<void>} [prepare]
 * @property {() => void} [registerInspect]
 * @property {(ctx: { state: object, upgrades: object[] }) => void} [onRunOpeningComplete]
 * @property {() => boolean} [isRadioDialogActive]
 * @property {(eventBus: object, pauseApi: { requestPause: (reason: string) => void, requestResume: (reason: string) => void }) => void} [wireRadio]
 * @property {(ctx: object) => void} [onSimulationEnter]
 * @property {(ctx: object, dt: number) => void} [onRunSceneTick]
 * @property {(payload: { enemy: object, state: object, upgrades: object[], fsm: object }) => void} [onCombatEnemyKilled]
 * @property {(state: object) => boolean} [canRunHordeSpawning]
 * @property {(state: object) => boolean} [blocksTurretTargeting]
 * @property {(state: object) => { show: boolean, text: string }} [getInspectMissionBanner]
 * @property {(state: object, worldX: number, worldY: number) => object | null} [findInspectorInspectPickup]
 * @property {(state: object, inspectKey: string) => void} [onInspectMissionOpen]
 * @property {(state: object, inspectKey: string) => void} [onInspectMissionClose]
 * @property {(state: object) => boolean} [isInspectMissionActive]
 * @property {Partial<import("./GameUiProfile.js").GameUiProfile>} [ui]
 * @property {Partial<import("./GamePerspective.js").PerspectiveConfig>} [perspective]
 * @property {(state: object) => "won" | "lost" | null} [getRunOutcome]
 */

export {};
