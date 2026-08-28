import { createApp } from "./app";
import { env } from "./config/env";
import { registerEventListeners } from "./infrastructure/events/registerEventListeners";
import { logger } from "./infrastructure/logging/logger";

registerEventListeners();

const app = createApp();

app.listen(env.port, () => {
  logger.info(`Flashkings API escuchando en http://localhost:${env.port} (${env.nodeEnv})`);
});
