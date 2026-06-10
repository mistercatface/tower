import { registerAssemblyManifest } from "./assemblyRegistry.js";
/** @type {Promise<void> | null} */
let loadPromise = null;
export function loadAssemblyManifests() {
    if (!loadPromise)
        loadPromise = fetch(new URL("./poolTable.assembly.json", import.meta.url))
            .then((response) => {
                if (!response.ok) throw new Error(`Failed to load poolTable assembly (${response.status})`);
                return response.json();
            })
            .then((manifest) => {
                registerAssemblyManifest(manifest);
            });
    return loadPromise;
}
