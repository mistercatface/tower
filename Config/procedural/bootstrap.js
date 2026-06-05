import {
    FloorProfileProvider,
    getFloorProfileProvider,
    installFloorProfileProvider,
    isFloorProfileProviderInstalled,
} from "../../Libraries/Procedural/FloorProfileProvider.js";
import {
    defaultFloorProceduralProfileId,
    floorProceduralProfiles,
} from "./profiles.js";

/** Install shipped game profiles into the active FloorProfileProvider (idempotent). */
export function installGameFloorProfileProvider() {
    if (isFloorProfileProviderInstalled()) {
        return getFloorProfileProvider();
    }
    return installFloorProfileProvider({
        profiles: floorProceduralProfiles,
        defaultProfileId: defaultFloorProceduralProfileId,
    });
}

export { FloorProfileProvider };
