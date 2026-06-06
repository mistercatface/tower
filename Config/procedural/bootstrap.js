import { resolveProceduralDesignConfig } from "../../Core/GameProceduralDesign.js";
import { SurfaceProfileProvider, getSurfaceProfileProvider, installSurfaceProfileProvider, isSurfaceProfileProviderInstalled } from "../../Libraries/Procedural/SurfaceProfileProvider.js";
import { surfaceProceduralProfiles } from "./profiles.js";
/**
 * Install shipped profile catalog. Requires `definition.proceduralDesign.surfaceProfileId`.
 *
 * @param {import("../../Core/GameDefinitionTypes.js").GameDefinition | null | undefined} definition
 */
export function installGameSurfaceProfileProvider(definition) {
    if (isSurfaceProfileProviderInstalled()) return getSurfaceProfileProvider();
    const design = resolveProceduralDesignConfig(definition);
    const defaultProfileId = design?.defaultSurfaceProfileId ?? design?.startSurfaceProfileId;
    if (!defaultProfileId) throw new Error("installGameSurfaceProfileProvider: gameDefinition.proceduralDesign.surfaceProfileId is required");
    return installSurfaceProfileProvider({ profiles: surfaceProceduralProfiles, defaultProfileId });
}
export { SurfaceProfileProvider };
