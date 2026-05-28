import { Segment } from "../Entities/Wall.js";

export const ConnectedGenerator = {
    generateConnected(state, nodeA, nodeB) {
        const coordsA = state.getNodeCombatCoords(nodeA);
        const coordsB = state.getNodeCombatCoords(nodeB);

        const mx = (coordsA.x + coordsB.x) / 2;
        const my = (coordsA.y + coordsB.y) / 2;

        state.wallTheme = nodeB.wallTheme || { r: 0, g: 188, b: 212 };

        const existingWalls = [...state.walls];

        state.gridSystem.centerX = mx;
        state.gridSystem.centerY = my;
        state.walls = [];
        state.walls.gridSystem = state.gridSystem;

        const tempWalls = [...existingWalls];
        if (nodeB.wallsData) {
            for (const w of nodeB.wallsData) {
                tempWalls.push(new Segment(w.x, w.y, w.angle, w.size, w.padding, w.maxHealth));
            }
        }

        const ax = coordsA.x, ay = coordsA.y;
        const bx = coordsB.x, by = coordsB.y;
        const vx = bx - ax;
        const vy = by - ay;
        const dist = Math.hypot(vx, vy);
        if (dist === 0) return;

        state.travelSourceCoords = coordsA;
        state.travelTargetCoords = coordsB;
        state.walls.push(...tempWalls);
        state.gridSystem.rebuild(state.walls, coordsA.x, coordsA.y);
    }
};
