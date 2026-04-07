import {
  on,
  off,
  emit,
  clearAllHandlers,
  EventType,
  type EventHandler,
  type ReportReadyPayload,
  type UrgencyHighPayload,
  type OutcomeRequestedPayload,
  type SubscriptionChangedPayload,
  type PetAddedPayload,
} from "@/lib/events/event-bus";

beforeEach(() => {
  clearAllHandlers();
});

describe("EventBus — subscribe / emit / unsubscribe lifecycle", () => {
  it("calls a registered handler when the matching event is emitted", async () => {
    const handler = jest.fn();
    on(EventType.REPORT_READY, handler);

    const payload: ReportReadyPayload = {
      userId: "user-1",
      sessionId: "sess-1",
      reportStorageId: "report-1",
      urgency: "high",
      petName: "Biscuit",
    };
    emit(EventType.REPORT_READY, payload);

    // Handlers are called asynchronously; flush the micro-task queue
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it("does not call a handler that was removed with off()", async () => {
    const handler = jest.fn();
    on(EventType.URGENCY_HIGH, handler);
    off(EventType.URGENCY_HIGH, handler);

    const payload: UrgencyHighPayload = {
      userId: "user-2",
      sessionId: "sess-2",
      urgency: "emergency",
      petName: "Daisy",
      topDiagnosis: "gastric dilatation",
    };
    emit(EventType.URGENCY_HIGH, payload);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handler).not.toHaveBeenCalled();
  });

  it("on() returns an unsubscribe function that removes the handler", async () => {
    const handler = jest.fn();
    const unsub = on(EventType.PET_ADDED, handler);

    unsub();

    const payload: PetAddedPayload = {
      userId: "user-3",
      petId: "pet-1",
      petName: "Luna",
    };
    emit(EventType.PET_ADDED, payload);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handler).not.toHaveBeenCalled();
  });

  it("calls multiple handlers registered for the same event type", async () => {
    const h1 = jest.fn();
    const h2 = jest.fn();
    on(EventType.SUBSCRIPTION_CHANGED, h1);
    on(EventType.SUBSCRIPTION_CHANGED, h2);

    const payload: SubscriptionChangedPayload = {
      userId: "user-4",
      plan: "pro",
      previousPlan: "free",
    };
    emit(EventType.SUBSCRIPTION_CHANGED, payload);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(h1).toHaveBeenCalledWith(payload);
    expect(h2).toHaveBeenCalledWith(payload);
  });

  it("does not call handlers for a different event type", async () => {
    const handler = jest.fn();
    on(EventType.PET_ADDED, handler);

    const payload: OutcomeRequestedPayload = {
      userId: "user-5",
      checkId: "check-1",
      petName: "Max",
    };
    emit(EventType.OUTCOME_REQUESTED, payload);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handler).not.toHaveBeenCalled();
  });

  it("emitting with no handlers registered does not throw", () => {
    expect(() => {
      emit(EventType.REPORT_READY, {
        userId: "user-6",
        sessionId: "",
        reportStorageId: null,
        urgency: "low",
        petName: "Charlie",
      });
    }).not.toThrow();
  });

  it("isolates handler errors — other handlers still run", async () => {
    const errorHandler: EventHandler<typeof EventType.REPORT_READY> = () => {
      throw new Error("handler exploded");
    };
    const safeHandler = jest.fn();

    on(EventType.REPORT_READY, errorHandler);
    on(EventType.REPORT_READY, safeHandler);

    emit(EventType.REPORT_READY, {
      userId: "user-7",
      sessionId: "sess-7",
      reportStorageId: null,
      urgency: "emergency",
      petName: "Rex",
    });

    // Give the error-catching promise a tick to settle
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(safeHandler).toHaveBeenCalledTimes(1);
  });

  it("typed payloads are passed through correctly for each event type", async () => {
    const results: unknown[] = [];

    on(EventType.OUTCOME_REQUESTED, (p) => results.push(p));
    on(EventType.PET_ADDED, (p) => results.push(p));

    const outcomePayload: OutcomeRequestedPayload = {
      userId: "u1",
      checkId: "c1",
      petName: "Pip",
    };
    const petPayload: PetAddedPayload = {
      userId: "u2",
      petId: "p1",
      petName: "Zara",
    };

    emit(EventType.OUTCOME_REQUESTED, outcomePayload);
    emit(EventType.PET_ADDED, petPayload);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual(outcomePayload);
    expect(results[1]).toEqual(petPayload);
  });
});
