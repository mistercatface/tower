import { Pickup } from "../Entities/Pickup.js";
import { GeneratorStrategies } from "./GeneratorStrategies.js";

export function spawnPickup(state, planetX, planetY, minRadius, maxRadius, type) {
    const grid = state.gridSystem;
    let spawned = false;
    let attempts = 0;
    while (!spawned && attempts < 100) {
        attempts++;
        const angle = Math.random() * Math.PI * 2;
        const dist = minRadius + Math.random() * (maxRadius - minRadius);
        const testX = planetX + Math.cos(angle) * dist;
        const testY = planetY + Math.sin(angle) * dist;
        const gridPos = grid.worldToGrid(testX, testY);
        if (gridPos.col >= 0 && gridPos.col < grid.cols && gridPos.row >= 0 && gridPos.row < grid.rows) {
            const idx = gridPos.row * grid.cols + gridPos.col;
            if (grid.grid[idx] !== 1) {
                const centerX = gridPos.col * grid.cellSize + grid.centerX - grid.offsetX + grid.cellSize / 2;
                const centerY = gridPos.row * grid.cellSize + grid.centerY - grid.offsetY + grid.cellSize / 2;
                state.pickups.push(new Pickup(centerX, centerY, 8, type));
                spawned = true;
            }
        }
    }
}

export const WallGenerator = {
    generate(state) {
        const planetX = state.planet.x;
        const planetY = state.planet.y;
        state.walls = [];
        state.gridSystem.centerX = planetX;
        state.gridSystem.centerY = planetY;
        const patterns = Object.keys(GeneratorStrategies);
        const selected = patterns[Math.floor(Math.random() * patterns.length)];
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
        GeneratorStrategies[selected].generate(state, planetX, planetY);
        state.gridSystem.rebuild(state.walls, planetX, planetY);
        if (!state.discoveredAbilities.has("Laser")) {
            spawnPickup(state, planetX, planetY, 250, 300, "coin");
        }
        spawnPickup(state, planetX, planetY, 175, 200, "eyeball");

        const numBarrels = 25 + Math.floor(Math.random() * 250);
        for (let i = 0; i < numBarrels; i++) {
            spawnPickup(state, planetX, planetY, 150, 1000, "barrel");
        }
    },
};
