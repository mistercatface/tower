import { snakeSpecies } from "./snakeSpecies.js";
import { fleeAgentSpecies } from "./fleeAgentSpecies.js";
import { hornSatelliteSpecies } from "./hornSatelliteSpecies.js";
export const SNAKE_GAME_SPECIES = new Map([
    [snakeSpecies.id, snakeSpecies],
    [fleeAgentSpecies.id, fleeAgentSpecies],
    [hornSatelliteSpecies.id, hornSatelliteSpecies],
]);
