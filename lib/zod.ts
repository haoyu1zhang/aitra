import { z } from 'zod';

// Extension pages forbid eval, so keep Zod from probing for it.
z.config({ jitless: true });

export { z };
