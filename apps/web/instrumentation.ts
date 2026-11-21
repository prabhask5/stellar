/**
 * Runs once when the server starts (Node runtime only): applies RESET_PIN,
 * brings the database schema up to date, and starts the scheduler loop.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { boot } = await import("@/lib/server/boot");
  await boot();
}
