import { registerAssemblyManifest } from "./assemblyRegistry.js";

const MANIFEST_FILES = ["poolTable.assembly.json", "poolTable9Ball.assembly.json"];

/** @type {Promise<void> | null} */
let loadPromise = null;

export function loadAssemblyManifests() {
    if (!loadPromise)
        loadPromise = Promise.all(
            MANIFEST_FILES.map((file) =>
                fetch(new URL(`./${file}`, import.meta.url)).then((response) => {
                    if (!response.ok) throw new Error(`Failed to load assembly manifest ${file} (${response.status})`);
                    return response.json();
                }),
            ),
        ).then((manifests) => {
            for (let i = 0; i < manifests.length; i++) registerAssemblyManifest(manifests[i]);
        });
    return loadPromise;
}
