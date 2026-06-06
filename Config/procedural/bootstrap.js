import { SurfaceProfileProvider, getSurfaceProfileProvider, installSurfaceProfileProvider, isSurfaceProfileProviderInstalled } from "../../Libraries/Procedural/SurfaceProfileProvider.js";
import { defaultSurfaceProfileId, surfaceProceduralProfiles } from "./profiles.js";
/** Install shipped game profiles into the active SurfaceProfileProvider (idempotent). */
export function installGameSurfaceProfileProvider() {
    if (isSurfaceProfileProviderInstalled()) return getSurfaceProfileProvider();
    return installSurfaceProfileProvider({ profiles: surfaceProceduralProfiles, defaultProfileId: defaultSurfaceProfileId });
}
export { SurfaceProfileProvider };
