import { findWorldPropAtInView } from "../../GameState/EntityRegistry.js";
import { kineticSpatial } from "../../Systems/World/KineticSpatialFrame.js";
import { handleButtonPointerDown, hitTestFloorButton } from "../Sandbox/floorButtons.js";
import { resolveSandboxBehaviors } from "../Sandbox/sandboxCapabilities.js";
import propCatalog from "../../Assets/props/index.js";
export function createSandboxPrimaryPointerTools(
    state,
    session,
    behaviors,
    { entityMeta, listSelectedBehaviors, stampPropBehavior, blocksPlacement, exitWireModes, exitButtonWire, resolveBehavior, resolveGroundMove, gestures, selectProp, togglePropInSelection },
) {
    const tryPlaceSpawnAtWorld = (world, options = {}) => {
        if (session.isWallPlaceMode() || session.isMapGenPlaceMode() || blocksPlacement()) return false;
        if (!session.spawnAt(world.x, world.y, options)) return false;
        stampPropBehavior(session.getSelectedProp());
        return true;
    };
    const modifierTool = {
        isActive: () => true,
        onPointerDown(world, e) {
            if (e.button !== 0 || (!e.ctrlKey && !e.metaKey)) return false;
            const hit = findWorldPropAtInView(state.entityRegistry, kineticSpatial, world.x, world.y);
            if (hit) return false;
            return tryPlaceSpawnAtWorld(world, { selectSpawned: false });
        },
    };
    const interactTool = {
        isActive: () => true,
        onPointerDown(world, e) {
            if (e.button !== 0) return false;
            const floorButton = hitTestFloorButton(state, world.x, world.y);
            if (floorButton && handleButtonPointerDown(state, floorButton, world)) {
                session.sync();
                return true;
            }
            for (let i = 0; i < behaviors.length; i++) if (behaviors[i].tryCanvasInput?.(world, e)) return true;
            session.pruneSelection();
            const registry = state.entityRegistry;
            const hit = findWorldPropAtInView(registry, kineticSpatial, world.x, world.y);
            if (hit) {
                if (state.followCamera?.focusFromPropId(hit.id)) return "consume";
                const allowed = resolveSandboxBehaviors(propCatalog[hit.type], behaviors, state, hit);
                if (allowed.length > 0) {
                    if (e.ctrlKey || e.metaKey) {
                        togglePropInSelection(hit.id);
                        return "consume";
                    }
                    selectProp(hit.id);
                }
                const prop = session.getSelectedProp();
                const behavior = resolveBehavior();
                if (prop && behavior?.onPointerDown(prop, world, e)) {
                    gestures.startPropInteraction(behavior, e);
                    return true;
                }
                return "consume";
            }
            const groundMove = resolveGroundMove();
            if (groundMove) {
                gestures.startGroundNav(groundMove, world, e);
                session.sync();
                return true;
            }
            const grid = state.obstacleGrid;
            const col = grid.worldCol(world.x);
            const row = grid.worldRow(world.y);
            if (session.pickRoomNodeAtWorld(world.x, world.y)) {
                exitButtonWire();
                return true;
            }
            if (grid.hasFloorOccupancy(col, row)) {
                session.select({ kind: "floor", col, row });
                return true;
            }
            if (session.pickForcefieldAtWorld(world.x, world.y)) return true;
            return false;
        },
    };
    const gestureTool = {
        isActive: () => true,
        capturesPointerMove: () => gestures.capturesPointerMove(),
        onPointerMove(_world, e) {
            gestures.onPointerMove(_world, e);
        },
        onPointerUp(world, e) {
            return gestures.onPointerUp(world, e);
        },
    };
    return { modifierTool, interactTool, gestureTool };
}
