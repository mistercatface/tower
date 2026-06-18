import { getPropAsset } from "../Props/PropCatalog.js";
import { findWorldPropAtInView } from "../../GameState/EntityRegistry.js";
import { kineticSpatial } from "../../Systems/World/KineticSpatialFrame.js";
import { handleButtonPointerDown, hitTestFloorButton } from "../Sandbox/floorButtons.js";
import { resolveSandboxBehaviors } from "../Sandbox/sandboxCapabilities.js";
import { ROLL_TO_CURSOR_HPA_BEHAVIOR_ID } from "../Sandbox/behaviors/rollToCursorHpaBehavior.js";
export function createSandboxPrimaryPointerTools(
    state,
    session,
    behaviors,
    {
        entityMeta,
        listSelectedBehaviors,
        getPropBehaviorId,
        stampPropBehavior,
        behaviorById,
        isPHeld,
        blocksPlacement,
        exitWireModes,
        exitButtonWire,
        resolveBehavior,
        resolveGroundMove,
        gestures,
        selectProp,
    },
) {
    const tryPlaceSpawnAtWorld = (world) => {
        if (session.isWallPlaceMode() || session.isMapGenPlaceMode() || blocksPlacement()) return false;
        if (!session.spawnAt(world.x, world.y)) return false;
        stampPropBehavior(session.getSelectedProp());
        return true;
    };
    const tryPickPlacedAtWorld = (world) => {
        const registry = state.entityRegistry;
        const hit = findWorldPropAtInView(registry, kineticSpatial, world.x, world.y);
        if (hit) {
            const allowed = resolveSandboxBehaviors(getPropAsset(hit.type), behaviors, state, hit);
            if (allowed.length === 0) return false;
            exitWireModes();
            session.setPlacePaletteKey(`prop:${hit.type}`);
            selectProp(hit.id);
            return true;
        }
        const grid = state.obstacleGrid;
        const { col, row } = grid.worldToGrid(world.x, world.y);
        if (session.pickRoomNodeAtWorld(world.x, world.y)) return true;
        if (grid.hasFloorOccupancy(col, row)) {
            session.select({ kind: "floor", col, row });
            return true;
        }
        return session.pickAnyWallAtWorld(world.x, world.y);
    };
    const issueMassHpaGroundMove = (world) => {
        if (session.isWallPlaceMode() || session.isMapGenPlaceMode() || blocksPlacement()) return false;
        const hpaBehavior = behaviorById.get(ROLL_TO_CURSOR_HPA_BEHAVIOR_ID);
        if (!hpaBehavior?.setGroundMoveTarget) return false;
        let moved = 0;
        state.entityRegistry.forEachOfKind("worldProp", (prop) => {
            if (prop.isDead) return;
            const allowed = resolveSandboxBehaviors(getPropAsset(prop.type), behaviors, state, prop);
            if (!allowed.includes(ROLL_TO_CURSOR_HPA_BEHAVIOR_ID)) return;
            if (getPropBehaviorId(prop) !== ROLL_TO_CURSOR_HPA_BEHAVIOR_ID) return;
            hpaBehavior.setGroundMoveTarget(prop, world);
            moved++;
        });
        return moved > 0;
    };
    const modifierTool = {
        isActive: () => true,
        onPointerDown(world, e) {
            if (e.button === 0 && (e.ctrlKey || e.metaKey) && tryPlaceSpawnAtWorld(world)) return true;
            if (e.button === 0 && e.shiftKey && tryPickPlacedAtWorld(world)) return true;
            return false;
        },
    };
    const interactTool = {
        isActive: () => true,
        onPointerDown(world, e) {
            if (e.button !== 0) return false;
            if (isPHeld() && issueMassHpaGroundMove(world)) {
                session.sync();
                return true;
            }
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
                const allowed = resolveSandboxBehaviors(getPropAsset(hit.type), behaviors, state, hit);
                if (allowed.length > 0) selectProp(hit.id);
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
            const { col, row } = grid.worldToGrid(world.x, world.y);
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
