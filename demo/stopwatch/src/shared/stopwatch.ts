import { z } from 'zod';
import { method } from '@thani-sh/steam-bun';

/**
 * Stopwatch represents the streaming RPC configuration for the stopwatch.
 */
export const Stopwatch = method('stopwatch', {
  input: z.object({ type: z.enum(['start', 'stop', 'reset']) }),
  output: z.object({ time: z.number() }),
});
