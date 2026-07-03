import { findWorldPropAtInView } from "../../GameState/EntityRegistry.js";
import { kineticSpatial } from "../../Systems/World/KineticSpatialFrame.js";
import { handleButtonPointerDown, hitTestFloorButton } from "../Sandbox/floorButtons.js";
import { resolveSandboxBehaviors } from "../Sandbox/sandboxCapabilities.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
import propCatalog from "../../Assets/props/index.js";
export function createSandboxPrimaryPointerTools(
    state,
    session,
    behaviors,
    { stampPropBehavior, blocksPlacement, exitWireModes, resolveBehavior, resolveGroundMove, gestures, issueGroundNavToSelected },
) {
    let lastClickTime = 0;
    let lastClickX = 0;
    let lastClickY = 0;
    let lastSelectedBoidId = null;
    let lastSelectedBoidTime = 0;
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
            const now = e.timeStamp || Date.now();
            const isDoubleTap = e.detail === 2 || (now - lastClickTime < 300 && Math.hypot(world.x - lastClickX, world.y - lastClickY) < 8.0);
            let targetBoidId = lastSelectedBoidId;
            if (state.editor.lockSelection) {
                const boid = state.worldProps.find((p) => p.type === "boid_triangle");
                if (boid) targetBoidId = boid.id;
            }
            if (isDoubleTap && targetBoidId && (state.editor.lockSelection || now - lastSelectedBoidTime < 500)) {
                exitWireModes();
                session.select({ kind: "prop", ids: [targetBoidId] });
                if (issueGroundNavToSelected("rollToCursorHpa", world)) {
                    lastClickTime = now;
                    lastClickX = world.x;
                    lastClickY = world.y;
                    return true;
                }
            }
            const selectedPropBeforeClick = session.getSelectedProp();
            if (selectedPropBeforeClick && selectedPropBeforeClick.type === "boid_triangle") {
                lastSelectedBoidId = selectedPropBeforeClick.id;
                lastSelectedBoidTime = now;
            } else {
                lastSelectedBoidId = null;
                lastSelectedBoidTime = 0;
            }
            lastClickTime = now;
            lastClickX = world.x;
            lastClickY = world.y;
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
                if (state.editor.lockSelection && !session.isSelected(hit.id)) return "consume";
                if (state.followCamera?.focusFromPropId(hit.id)) return "consume";
                if (hit.type === "boid_triangle") {
                    const entityMeta = getSandboxEntityMeta(state);
                    const prevId = entityMeta.getActiveBehaviorId(hit.id);
                    if (prevId && prevId !== "dragLaunch") {
                        const prevBehavior = behaviors.find((b) => b.id === prevId);
                        if (prevBehavior?.clearMoveTarget) prevBehavior.clearMoveTarget(hit);
                    }
                    entityMeta.setActiveBehaviorId(hit.id, "dragLaunch");
                }
                const allowed = resolveSandboxBehaviors(propCatalog[hit.type], behaviors, state, hit);
                if (allowed.length > 0) {
                    if (e.ctrlKey || e.metaKey) {
                        exitWireModes();
                        session.togglePropInSelection(hit.id);
                        return "consume";
                    }
                    exitWireModes();
                    session.select({ kind: "prop", ids: [hit.id] });
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
            if (state.editor.lockSelection) return false;
            const grid = state.obstacleGrid;
            const col = grid.worldCol(world.x);
            const row = grid.worldRow(world.y);
            if (session.pickRoomNodeAtWorld(world.x, world.y)) {
                exitWireModes();
                return true;
            }
            if (grid.hasFloorOccupancy(col + row * grid.cols)) {
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
