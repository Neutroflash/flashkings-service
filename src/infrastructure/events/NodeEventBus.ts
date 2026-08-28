import { EventEmitter } from "events";
import { IEventBus } from "../../domain/services/IEventBus";
import { DomainEvent } from "../../domain/events/OrderEvents";
import { logger } from "../logging/logger";

/**
 * In-process pub/sub (no queue/retry) — sufficient decoupling for transactional notifications
 * at this scale. A handler failure is logged, never thrown back at the publisher: a flaky
 * email provider must not fail the payment/shipping flow that triggered the notification.
 */
export class NodeEventBus implements IEventBus {
  private readonly emitter = new EventEmitter();

  publish(event: DomainEvent): void {
    this.emitter.emit(event.type, event);
  }

  subscribe<T extends DomainEvent>(type: T["type"], handler: (event: T) => void | Promise<void>): void {
    this.emitter.on(type, (event: T) => {
      Promise.resolve(handler(event)).catch((err) => {
        logger.error({ err, eventType: type }, "Error handling domain event");
      });
    });
  }
}

export const eventBus = new NodeEventBus();
