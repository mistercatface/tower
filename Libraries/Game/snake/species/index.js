import { createAgentSpecies } from "./createAgentSpecies.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";

class DynamicSpeciesMap extends Map {
    get(key) {
        if (!super.has(key)) {
            const config = getSnakeGameConfig();
            if (config?.agentProfiles?.[key]) {
                const species = createAgentSpecies(key);
                super.set(key, species);
            }
        }
        return super.get(key);
    }
    
    has(key) {
        const config = getSnakeGameConfig();
        return super.has(key) || !!config?.agentProfiles?.[key];
    }
    
    keys() {
        const config = getSnakeGameConfig();
        return new Set([...super.keys(), ...Object.keys(config?.agentProfiles ?? {})]).keys();
    }
}

export const SNAKE_GAME_SPECIES = new DynamicSpeciesMap();
export { createAgentSpecies };
