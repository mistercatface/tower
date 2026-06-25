import { snakeSpecies, fleeAgentSpecies, squidSpecies, gunAgentSpecies } from "./createAgentSpecies.js";
export { snakeSpecies, fleeAgentSpecies, squidSpecies, gunAgentSpecies, createAgentSpecies } from "./createAgentSpecies.js";
export const SNAKE_GAME_SPECIES = new Map([
    [snakeSpecies.id, snakeSpecies],
    [fleeAgentSpecies.id, fleeAgentSpecies],
    [squidSpecies.id, squidSpecies],
    [gunAgentSpecies.id, gunAgentSpecies],
]);
