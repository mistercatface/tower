import { Pickup } from "../Entities/Pickup.js";
import { GeneratorStrategies } from "./GeneratorStrategies.js";
import { pickupSpawnSettings } from "../Config/Config.js";

export function spawnPickup(state, playerX, playerY, minRadius, maxRadius, type) {
    const grid = state.flowFieldGrid;
    let spawned = false;
    let attempts = 0;
    while (!spawned && attempts < 100) {
        attempts++;
        const angle = Math.random() * Math.PI * 2;
        const dist = minRadius + Math.random() * (maxRadius - minRadius);
        const testX = playerX + Math.cos(angle) * dist;
        const testY = playerY + Math.sin(angle) * dist;
        const gridPos = grid.worldToGrid(testX, testY);
        if (gridPos.col >= 0 && gridPos.col < grid.cols && gridPos.row >= 0 && gridPos.row < grid.rows) {
            const idx = gridPos.row * grid.cols + gridPos.col;
            if (grid.grid[idx] !== 1) {
                const centerX = gridPos.col * grid.cellSize + grid.centerX - grid.offsetX + grid.cellSize / 2;
                const centerY = gridPos.row * grid.cellSize + grid.centerY - grid.offsetY + grid.cellSize / 2;
                state.pickups.push(new Pickup(centerX, centerY, type));
                spawned = true;
            }
        }
    }
}

export const WallGenerator = {
    generate(state) {
        const playerX = state.player.x;
        const playerY = state.player.y;
        state.walls = [];
        state.walls.obstacleGrid = state.obstacleGrid;
        state.flowFieldGrid.centerX = playerX;
        state.flowFieldGrid.centerY = playerY;
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
        GeneratorStrategies[selected].generate(state, playerX, playerY);
        state.obstacleGrid.rebuild(state.walls);
        state.navigation.rebuildNavigationGraph(playerX, playerY);
        if (!state.discoveredAbilities.has("Laser")) {
            spawnPickup(state, playerX, playerY, pickupSpawnSettings.coinMinRadius, pickupSpawnSettings.coinMaxRadius, "coin");
        }
        spawnPickup(state, playerX, playerY, pickupSpawnSettings.eyeballMinRadius, pickupSpawnSettings.eyeballMaxRadius, "eyeball");

        const numBarrels = pickupSpawnSettings.barrelMinCount + Math.floor(Math.random() * pickupSpawnSettings.barrelRandomRange);
        for (let i = 0; i < numBarrels; i++) {
            spawnPickup(state, playerX, playerY, pickupSpawnSettings.barrelMinRadius, pickupSpawnSettings.barrelMaxRadius, "barrel");
        }
    },
};
