import { z } from '../zod';
import { ERROR_CODES, type DetailKey } from '../errors';
import { settingsSchema } from '../storage/settings';

export const MAX_TEXT_LENGTH = 1000;
export const TRANSLATE_PORT = 'aitra:translate';

const errorInfo = z.object({
  code: z.enum(ERROR_CODES),
  message: z.string(),
  retryable: z.boolean(),
  detail: z.string().optional(),
  // Checked loosely here; an unknown key just falls back to the key itself.
  detailKey: z.custom<DetailKey>((v) => typeof v === 'string' && v.startsWith('detail.')).optional(),
});

export const translateDataSchema = z.object({
  source: z.string(),
  translated: z.string(),
  targetLang: z.string(),
  detectedSourceLang: z.string().optional(),
  provider: z.string(),
  cached: z.boolean(),
  elapsedMs: z.number(),
  firstChunkMs: z.number().optional(),
});
export type TranslateData = z.infer<typeof translateDataSchema>;

// content -> background, over the translate port
export const portRequestSchema = z.object({
  type: z.literal('translate'),
  text: z.string(),
});
export type PortRequest = z.infer<typeof portRequestSchema>;

// background -> content, over the translate port
export const portEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('chunk'), text: z.string() }),
  z.object({ type: z.literal('done'), data: translateDataSchema }),
  z.object({ type: z.literal('error'), error: errorInfo }),
]);
export type PortEvent = z.infer<typeof portEventSchema>;

// options/popup -> background, via runtime.sendMessage
export const runtimeRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('provider:test'), settings: settingsSchema }),
  z.object({ type: z.literal('cache:stats') }),
  z.object({ type: z.literal('cache:clear') }),
]);
export type RuntimeRequest = z.infer<typeof runtimeRequestSchema>;

export type RuntimeResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: z.infer<typeof errorInfo> };

export interface TestResult {
  /** Time to the first streamed chunk, or the whole request if nothing streamed. */
  elapsedMs: number;
}

export interface CacheStats {
  count: number;
  max: number;
}

// background -> content, via tabs.sendMessage
export const triggerMessageSchema = z.object({
  type: z.literal('trigger'),
  origin: z.enum(['command', 'contextMenu']),
  fallbackText: z.string().optional(),
});
export type TriggerMessage = z.infer<typeof triggerMessageSchema>;
