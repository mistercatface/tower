import { snakeSpecies } from "./snakeSpecies.js";
import { fleeAgentSpecies } from "./fleeAgentSpecies.js";
import { squidSpecies } from "./squidSpecies.js";
export const SNAKE_GAME_SPECIES = new Map([
    [snakeSpecies.id, snakeSpecies],
    [fleeAgentSpecies.id, fleeAgentSpecies],
    [squidSpecies.id, squidSpecies],
]);
