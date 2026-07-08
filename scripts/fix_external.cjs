const fs = require("fs");

const files = [
    "c:/Users/mrjbl/Desktop/tower/tests/WorkerNavigationFactory.js",
    "c:/Users/mrjbl/Desktop/tower/tests/portalNav.test.js",
    "c:/Users/mrjbl/Desktop/tower/tests/nodeWorkerShim.test.js",
    "c:/Users/mrjbl/Desktop/tower/tests/hpaRegionGraph.test.js",
    "c:/Users/mrjbl/Desktop/tower/tests/hpaPathLengthBudget.test.js",
    "c:/Users/mrjbl/Desktop/tower/Libraries/Spatial/spatial.js",
    "c:/Users/mrjbl/Desktop/tower/Libraries/Navigation/NavCore.js",
    "c:/Users/mrjbl/Desktop/tower/GameState/SharedGameState.js",
    "c:/Users/mrjbl/Desktop/tower/Render/WorldSurfaceBootstrap.js"
];

for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let text = fs.readFileSync(file, "utf8");
    
    // Replace Libraries/Pathfinding/ with Libraries/Navigation/
    text = text.replace(/Libraries\/Pathfinding\//g, "Libraries/Navigation/");
    // Replace ../Pathfinding/ with ../Navigation/
    text = text.replace(/\.\.\/Pathfinding\//g, "../Navigation/");
    
    // Replace Libraries/Workers/Navigation/ with Libraries/Navigation/
    text = text.replace(/Libraries\/Workers\/Navigation\//g, "Libraries/Navigation/");
    
    fs.writeFileSync(file, text);
}
console.log("Fixed external imports");
