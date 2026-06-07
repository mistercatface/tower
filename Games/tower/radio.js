import { radioSpeakers } from "../../Config/content/radio/RadioSpeakers.js";
import { radioConversations } from "../../Config/content/radio/RadioConversations.js";
import { createRadioSystem } from "../../Libraries/Radio/createRadioSystem.js";
export const towerRadio = createRadioSystem({ conversations: radioConversations, speakers: radioSpeakers, mainCharacterId: "brock" });
