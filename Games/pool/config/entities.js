import { registerEntityCatalog } from "../../../Entities/EntityRegistry.js";

/** @type {import("../../../Entities/EntityRegistryTypes.js").EntityCatalog} */
export const poolEntityCatalog = {
    enemies: {},
    allies: {},
    runParty: [],
    events: {},
};

export function registerPoolEntities() {
    registerEntityCatalog(poolEntityCatalog);
}
