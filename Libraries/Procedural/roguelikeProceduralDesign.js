import { SURFACE_PROFILE_ID } from "../../Config/procedural/profileIds.js";
import { BaseGeneratorStrategies } from "../../Generator/GeneratorStrategies.js";
const surfaceProfileId = SURFACE_PROFILE_ID.tomatoGarden;
const surfaceProfileByStrategy = Object.fromEntries(Object.keys(BaseGeneratorStrategies).map((key) => [key, surfaceProfileId]));
surfaceProfileByStrategy.StartGameBuildingStrategy = surfaceProfileId;
/** Default floor/wall procedural look for roguelike map games. */
export const roguelikeProceduralDesign = { surfaceProfileId, surfaceProfileByStrategy };
