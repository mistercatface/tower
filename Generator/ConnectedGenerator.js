import { Segment } from "../Entities/Wall.js";
import { GeneratorStrategies } from "./GeneratorStrategies.js";

export const ConnectedGenerator = {
    generateConnected(state, nodeA, nodeB) {
        const coordsA = state.getNodeCombatCoords(nodeA);
        const coordsB = state.getNodeCombatCoords(nodeB);

        const mx = (coordsA.x + coordsB.x) / 2;
        const my = (coordsA.y + coordsB.y) / 2;

        const themeColors = [
            { r: 0, g: 188, b: 212 },
            { r: 76, g: 175, b: 80 },
            { r: 255, g: 152, b: 0 },
            { r: 156, g: 39, b: 176 },
            { r: 63, g: 81, b: 181 },
            { r: 244, g: 67, b: 54 },
            { r: 233, g: 30, b: 99 },
            { r: 0, g: 150, b: 136 },
            { r: 205, g: 220, b: 57 },
            { r: 121, g: 85, b: 72 }
        ];
        state.wallTheme = themeColors[Math.floor(Math.random() * themeColors.length)];

        const existingWalls = [...state.walls];

        state.gridSystem.centerX = mx;
        state.gridSystem.centerY = my;
        state.walls = [];
        state.walls.gridSystem = state.gridSystem;

        const tempWalls = [...existingWalls];
        const mockState = {
            walls: tempWalls,
            gridSystem: state.gridSystem,
            waveManager: state.waveManager
        };

        const strategies = Object.keys(GeneratorStrategies);
        const stratB = strategies[Math.floor(Math.random() * strategies.length)];

        GeneratorStrategies[stratB].generate(mockState, coordsB.x, coordsB.y);

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
