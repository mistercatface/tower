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
            { speakerId: "brock", text: "This stuff is weirdly flammable. I don't get why they panicked like that though." },
            { speakerId: "barry", text: "I do object to how hard he's gripping that banana." },
            { speakerId: "brock", text: "That banana knew what he was signing up for." },
        ],
    },
    start_node_inspection_complete_barry_brock: {
        trigger: "start_node_inspection_complete",
        oncePerRun: true,
        lines: [
            { speakerId: "brock", text: "I guess we need to find this Jacko guy. How big is this place?" },
            { speakerId: "barry", text: "Who knows? With these liminal spaces it could be literally infinite. It's always the sketchiest people setting up shop in these abandoned oatlinks." },
            { speakerId: "brock", text: "Well, he has to be around here somewhere. They say he never leaves his cave, and his goons are all over the place." },
            { speakerId: "barry", text: "Okay, let's move. And keep your headset on, they might put something on the loudspeakers to uh, try to hypnotize us." },
            { speakerId: "brock", text: "Hypnotize us? That wasn't mentioned in the mission brief." },
            { speakerId: "barry", text: "I decided it was on a need to know basis, rookie." },
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
