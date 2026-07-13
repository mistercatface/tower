import { EntityRegistry } from "../../GameState/EntityRegistry.js";
import { FractureEngine } from "../../Libraries/Physics/fracture.js";
import { createKineticSession } from "../../Libraries/Physics/physics.js";
import { SandboxWorldState } from "../../Libraries/Sandbox/sandbox.js";
import { WorldObstacleGrid } from "../../Libraries/Spatial/spatial.js";
import { createDefaultSandboxBehaviors, createSandboxController } from "../../Libraries/Sandbox/sandbox.js";
import { EDITOR_NAV_MODE_HPA } from "../../Core/engineEnums.js";
import { recomputeViewBounds } from "../../Core/engineMemory.js";

export function createSandboxDragTestState() {
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    const grid = new WorldObstacleGrid(16);
    grid.rebuildFixed(0, 0, 512, 512);
    recomputeViewBounds(128, 128, 1e6, 1e6);
    const world = {
        obstacleGrid: grid,
        entityRegistry: new EntityRegistry(),
        kinetic: createKineticSession(),
        sandbox: new SandboxWorldState(),
        viewport: {
            x: 128,
            y: 128,
            snapTo() {},
        },
        worldSurfaces: { settings: { maxWallHeightLevel: 8 } },
        editor: { showSelectionRings: true, navMode: EDITOR_NAV_MODE_HPA },
        nav: {
            settings: { stuckMoveThreshold: 0.5, stuckReplanFrames: 6, pathOffPathDistance: 4 },
            topologyKey() {
                return "mockKey";
            },
            syncedTopologyKey() {
                return "mockKey";
            },
            worker: { releaseOwnedPathSlot() {} },
            session: {
                isReplanInFlight() {
                    return false;
                },
                requestReplan() {
                    return true;
                },
            },
        },
    };
    world.fractureEngine = new FractureEngine(world);
    return world;
}

export function createGrabDragTestState() {
    const state = createSandboxDragTestState();
    const behaviors = createDefaultSandboxBehaviors(state);
    state.sandbox.behaviorById = new Map(behaviors.map((behavior) => [behavior.id, behavior]));
    return state;
}

export function registerGrabDragTestProp(state, prop) {
    state.entityRegistry.register("worldProp", prop);
    return prop;
}

export function createSandboxDragTestController(state) {
    const eventListeners = {};
    const canvas = {
        addEventListener(type, listener) {
            eventListeners[type] = listener;
        },
        removeEventListener(type, listener) {
            delete eventListeners[type];
        },
        setPointerCapture() {},
        releasePointerCapture() {},
    };
    const behaviors = createDefaultSandboxBehaviors(state);
    const behaviorById = new Map(behaviors.map((behavior) => [behavior.id, behavior]));
    const controller = createSandboxController(state, {
        getCanvas: () => canvas,
        clientToWorld: (clientX, clientY) => ({ x: clientX, y: clientY }),
        behaviors,
    });
    controller.register();
    return { controller, behaviorById, eventListeners, canvas };
}
