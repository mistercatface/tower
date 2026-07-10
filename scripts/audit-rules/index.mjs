import * as reexportBarrel from "./reexportBarrel.mjs";
import * as libraryImportsApp from "./libraryImportsApp.mjs";
import * as deletedPassthrough from "./deletedPassthrough.mjs";
import * as legacySandboxDrag from "./legacySandboxDrag.mjs";
import * as testProductionBoundary from "./testProductionBoundary.mjs";
import * as innerJsdocTags from "./innerJsdocTags.mjs";
import * as thinForwarder from "./thinForwarder.mjs";
import * as optionalTestGuard from "./optionalTestGuard.mjs";
import * as hotPathObjectPush from "./hotPathObjectPush.mjs";
import * as legacyScalarSymbols from "./legacyScalarSymbols.mjs";

export const rules = [
    reexportBarrel,
    libraryImportsApp,
    deletedPassthrough,
    legacySandboxDrag,
    testProductionBoundary,
    legacyScalarSymbols,
    innerJsdocTags,
    thinForwarder,
    optionalTestGuard,
    hotPathObjectPush,
];
