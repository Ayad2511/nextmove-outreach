// instrumentation.ts — Next.js lifecycle hook
// Draait één keer bij serverstart, vóór de eerste request
// Zie: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  // Alleen uitvoeren in de Node.js runtime (niet in Edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { autoMigrate } = await import('./lib/auto-migrate');
    await autoMigrate();
  }
}
