import { showNodeConfirm } from "./UI.js";

export class InputManager {
    static setup(canvas, state, viewport, upgrades) {
        let lastTapTime = 0;
        let initialPinchDistance = null;
        let initialZoom = 1;

        canvas.addEventListener(
            "wheel",
            (e) => {
                e.preventDefault();
                const zoomAmount = e.deltaY * -0.001;
                viewport.setZoom(viewport.zoom + zoomAmount);
            },
            { passive: false },
        );

        canvas.addEventListener(
            "touchstart",
            (e) => {
                if (e.touches.length === 2) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    initialPinchDistance = Math.hypot(dx, dy);
                    initialZoom = viewport.zoom;
                }
            },
            { passive: false },
        );

        canvas.addEventListener(
            "touchmove",
            (e) => {
                if (e.touches.length === 2 && initialPinchDistance) {
                    e.preventDefault();
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const currentDistance = Math.hypot(dx, dy);
                    const ratio = currentDistance / initialPinchDistance;
                    viewport.setZoom(initialZoom * ratio);
                }
            },
            { passive: false },
        );

        canvas.addEventListener("touchend", (e) => {
            if (e.touches.length < 2) {
                initialPinchDistance = null;
            }
        });

        canvas.addEventListener("pointerdown", (e) => {
            const currentTime = Date.now();
            const isDoubleTap = currentTime - lastTapTime < 300;
            lastTapTime = currentTime;
            const rect = canvas.getBoundingClientRect();
            const screenX = e.clientX - rect.left;
            const screenY = e.clientY - rect.top;
            const worldCoords = viewport.screenToWorld(screenX, screenY);
            if (state.phase === "map") {
                const currentNode = state.mapNodes.find((n) => n.id === state.currentNodeId);
                if (!currentNode) return;
                for (const neighborId of currentNode.connections) {
                    const neighbor = state.mapNodes.find((n) => n.id === neighborId);
                    const dist = Math.hypot(neighbor.x - worldCoords.x, neighbor.y - worldCoords.y);
                    if (dist < 20) {
                        showNodeConfirm(neighbor, () => {
                            state.mapTargetNodeId = neighbor.id;
                            state.phase = "map_transition";
                        });
                        break;
                    }
                }
            } else if (state.phase === "combat") {
                if (!state.upgrades["Reposition"] || state.upgrades["Reposition"].level === 0) return;
                const distFromSpawn = Math.hypot(worldCoords.x - state.planet.spawnX, worldCoords.y - state.planet.spawnY);
                if (distFromSpawn <= state.weapon.range) {
                    const gridPos = state.gridSystem.worldToGrid(worldCoords.x, worldCoords.y);
                    if (gridPos.col >= 0 && gridPos.col < state.gridSystem.cols && gridPos.row >= 0 && gridPos.row < state.gridSystem.rows) {
                        if (state.gridSystem.grid[gridPos.row * state.gridSystem.cols + gridPos.col] !== 1) {
                            const targetX = gridPos.col * state.gridSystem.cellSize + state.gridSystem.centerX - state.gridSystem.offsetX + state.gridSystem.cellSize / 2;
                            const targetY = gridPos.row * state.gridSystem.cellSize + state.gridSystem.centerY - state.gridSystem.offsetY + state.gridSystem.cellSize / 2;
                            let isDiving = false;
                            upgrades
                                .filter((u) => u.isAbility && u.triggerType === "double_tap_move" && state.abilities[u.id])
                                .forEach((upg) => {
                                    if (state.scheduler.getTimeRemaining(state.abilityTimers[upg.id].activeId) > 0) {
                                        isDiving = true;
                                    }
                                });
                            if (isDiving) {
                                state.planet.queueTarget(targetX, targetY);
                            } else {
                                state.planet.setTarget(targetX, targetY);
                                state.gridSystem.buildPlayerFlowField(targetX, targetY);
                                if (isDoubleTap) {
                                    upgrades
                                        .filter((u) => u.isAbility && u.triggerType === "double_tap_move" && state.abilities[u.id])
                                        .forEach((upg) => {
                                            if (state.scheduler.getTimeRemaining(state.abilityTimers[upg.id].cooldownId) <= 0) {
                                                state.abilityTimers[upg.id].activeId = state.scheduler.schedule(upg.activeDuration, () => {});
                                                state.abilityTimers[upg.id].cooldownId = state.scheduler.schedule(upg.cooldown, () => {});
                                                if (upg.onTrigger) upg.onTrigger(state);
                                            }
                                        });
                                }
                            }
                        }
                    }
                }
            }
        });
    }
}
