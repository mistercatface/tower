import { snakeSpecies, fleeAgentSpecies, squidSpecies } from "./createAgentSpecies.js";
export { snakeSpecies, fleeAgentSpecies, squidSpecies, createAgentSpecies } from "./createAgentSpecies.js";
export const SNAKE_GAME_SPECIES = new Map([
    [snakeSpecies.id, snakeSpecies],
    [fleeAgentSpecies.id, fleeAgentSpecies],
    [squidSpecies.id, squidSpecies],
]);
