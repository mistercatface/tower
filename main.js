import { loadAssemblyManifests } from "./Libraries/Sandbox/assemblies/loadAssemblyManifests.js";

loadAssemblyManifests()
    .then(() => import("./Libraries/Props/loadPropAssets.js"))
    .then(({ loadPropAssets }) => {
        loadPropAssets();
        return import("./Apps/Editor/createEditorApp.js");
    })
    .then(({ createEditorApp }) => createEditorApp());
