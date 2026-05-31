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
