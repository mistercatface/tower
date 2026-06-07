import { radioSpeakers } from "./config/content/radio/RadioSpeakers.js";
import { radioConversations } from "./config/content/radio/RadioConversations.js";
import { createRadioSystem } from "../../Libraries/Radio/createRadioSystem.js";
export const towerRadio = createRadioSystem({ conversations: radioConversations, speakers: radioSpeakers, mainCharacterId: "brock" });
