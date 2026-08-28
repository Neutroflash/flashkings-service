import { DomainEvent } from "../events/OrderEvents";

/**
 * Decouples order/payment use cases (which only know "this happened") from notification
 * infrastructure (which knows "send an email/WhatsApp link for this"). Use cases publish;
 * infrastructure/events/registerEventListeners.ts subscribes EmailService to react.
 */
export interface IEventBus {
  publish(event: DomainEvent): void;
  subscribe<T extends DomainEvent>(type: T["type"], handler: (event: T) => void | Promise<void>): void;
}
