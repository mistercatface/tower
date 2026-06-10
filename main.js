import { createGame } from "./Core/createGame.js";
import { loadGameFromUrl } from "./Core/gameRegistry.js";
import { loadAssemblyManifests } from "./Libraries/Sandbox/assemblies/loadAssemblyManifests.js";

loadAssemblyManifests()
    .then(() => import("./Libraries/Props/loadPropAssets.js"))
    .then(({ loadPropAssets }) => {
        loadPropAssets();
        return loadGameFromUrl();
    })
    .then(createGame);
