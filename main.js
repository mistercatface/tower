import("./Libraries/Props/loadPropAssets.js")
    .then(({ loadPropAssets }) => {
        loadPropAssets();
        return import("./Apps/Editor/engine.js");
    })
    .then(({ createEditorApp }) => createEditorApp());
