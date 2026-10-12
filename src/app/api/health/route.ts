// Liveness check for Cloud Run and uptime monitoring. Extended later to probe Gemini and Firestore.
export async function GET() {
  return Response.json({ ok: true, service: "kibo", revision: process.env.K_REVISION ?? "local", time: new Date().toISOString() });
}
