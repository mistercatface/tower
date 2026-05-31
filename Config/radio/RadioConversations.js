/** Scripted radio conversations keyed by id. */
export const radioConversations = {
    run_start_barry_brock: {
        trigger: "run_start",
        oncePerRun: true,
        lines: [
            { speakerId: "barry", text: "Okay Brock, I'm letting you take the lead on this one." },
            { speakerId: "brock", text: "Okay, I'm ready." },
        ],
    },
    start_node_guards_chickpea_garbanzo: {
        trigger: "start_node_guards",
        oncePerRun: true,
        lines: [
            { speakerId: "chickpea", text: "Um, who are you?" },
            { speakerId: "brock", text: "Hi, I'm Brock with the FDA. We're here for the surprise inspection. Which one of you is Garbanzo?" },
            { speakerId: "garbanzo", text: "Which one do you think, holmes?" },
            { speakerId: "chickpea", text: "Oh my god babe let's kill them." },
        ],
    },
    first_wave_clear_barry_brock: {
        trigger: "first_wave_clear",
        oncePerRun: true,
        lines: [
            { speakerId: "brock", text: "They weren't happy to see us." },
            { speakerId: "barry", text: "Yeah, that's usually what happens with these surprise inspections." },
            { speakerId: "brock", text: "I said the proper greeting and everything." },
            { speakerId: "barry", text: "Watch it kid, QA will dock your pay for going off script on that." },
            { speakerId: "brock", text: "I guess we should look around." },
        ],
    },
    inspect_jacko_can_garbanzo: {
        trigger: "inspect:jacko_can",
        oncePerRun: true,
        lines: [
            { speakerId: "brock", text: "So what are we doing here anyway?" },
            { speakerId: "barry", text: "I was hoping it would just be a routine inspection." },
            { speakerId: "brock", text: "I do object to how hard he's gripping that banana." },
            { speakerId: "barry", text: "He knew what he was signing up for." },
        ],
    },
    inspect_wood_crate_barry_brock: {
        trigger: "inspect:wood_crate",
        oncePerRun: true,
        lines: [
            { speakerId: "brock", text: "Horchata... Hey Barry, don't you drink this stuff?" },
            { speakerId: "barry", text: "Uh, yeah. It was me who phoned in the tip on this one actually." },
            { speakerId: "brock", text: "Really? Why? Was this what was making you have to go to the bathroom all the time?" },
            { speakerId: "barry", text: "We better keep moving." },
        ],
    },
};
