import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

app.listen(env.PORT, env.HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Lapak backend listening on http://${env.HOST}:${env.PORT}`);
});
