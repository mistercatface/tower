import("./Libraries/Props/loadPropAssets.js")
    .then(({ loadPropAssets }) => {
        loadPropAssets();
        return Promise.all([import("./Apps/Editor/engine.js"), import("./Libraries/Game/parseGameLaunchQuery.js")]);
    })
    .then(([{ createEditorApp }, { parseGameLaunchQuery }]) => {
        const gameLaunchId = parseGameLaunchQuery();
        createEditorApp({ gameLaunchId });
    });
