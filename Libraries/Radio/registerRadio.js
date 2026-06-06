/**
 * Wire a radio controller + view to an event bus.
 *
 * @param {import("../Events/EventBus.js").EventBus} eventBus
 * @param {ReturnType<import("./RadioController.js").createRadioController>} controller
 * @param {ReturnType<import("./RadioDialogView.js").createRadioDialogView>} view
 * @param {{
 *   RADIO_START: string,
 *   RADIO_TRIGGER: string,
 *   RADIO_ADVANCE: string,
 *   RADIO_END: string,
 *   UI_SHOW_RADIO: string,
 *   UI_HIDE_RADIO: string,
 * }} radioEvents
 */
export function registerRadio(eventBus, controller, view, radioEvents) {
    eventBus.on(radioEvents.RADIO_START, ({ conversationId, onComplete, state, force }) => {
        controller.startSession(conversationId, onComplete, state, { force });
    });
    eventBus.on(radioEvents.RADIO_TRIGGER, ({ trigger, onComplete, state }) => {
        controller.fireTrigger(trigger, onComplete, state);
    });
    eventBus.on(radioEvents.RADIO_ADVANCE, () => {
        controller.advance();
    });
    eventBus.on(radioEvents.RADIO_END, () => {
        controller.end();
    });
    eventBus.on(radioEvents.UI_SHOW_RADIO, (data) => view.show(data));
    eventBus.on(radioEvents.UI_HIDE_RADIO, () => view.hide());
    view.bindAdvanceInput(() => eventBus.emit(radioEvents.RADIO_ADVANCE));
}
