import { createRadioSystem } from "../../Libraries/Radio/createRadioSystem.js";
const poolSpeakers = { coach: { id: "coach", name: "Coach", portrait: "Images/RadioPortraits/barry.png" } };
const poolConversations = {
    break_shot: { trigger: "break_shot", oncePerRun: true, lines: [{ speakerId: "coach", text: "Pull back opposite where you want to shoot." }] },
    table_clear: { trigger: "table_clear", oncePerRun: true, lines: [{ speakerId: "coach", text: "Table clear!." }] },
};
export const poolRadio = createRadioSystem({ conversations: poolConversations, speakers: poolSpeakers, mainCharacterId: "coach" });
