import { surfaceProceduralProfiles } from "../../Config/procedural/profiles.js";
import { installSurfaceProfileProvider } from "../../Libraries/Procedural/SurfaceProfileProvider.js";
import { TileSurfaceWorker } from "./TileSurfaceWorker.js";
installSurfaceProfileProvider({ profiles: surfaceProceduralProfiles });
const worker = new TileSurfaceWorker();
self.onmessage = (e) => worker.onMessage(e);
