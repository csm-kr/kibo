import { startRelay } from "./server";

// Entry point of the kibo-voice image (Dockerfile.voice); Cloud Run sets PORT.
void startRelay({ port: Number(process.env.PORT ?? 8080) }).then(({ port }) => console.log(`kibo-voice listening on ${port}`));
