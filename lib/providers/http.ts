import { errorFromStatus } from '../errors';

const KEY_PATTERN = /\b(sk-[A-Za-z0-9_\-*]{4,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:fx)?)/gi;

/** Removes anything that looks like an API key before showing it to the user. */
export function redact(text: string): string {
  return text.replace(KEY_PATTERN, '***');
}

async function readErrorDetail(res: Response): Promise<string | undefined> {
  let raw: string;
  try {
    raw = await res.text();
  } catch {
    return undefined;
  }
  let message: unknown = raw;
  try {
    const json = JSON.parse(raw) as Record<string, unknown>;
    const err = json.error;
    message =
      (typeof err === 'object' && err && (err as Record<string, unknown>).message) ||
      (typeof err === 'string' && err) ||
      json.message ||
      json.detail ||
      raw;
  } catch {
    // Plain text body.
  }
  if (typeof message !== 'string') return undefined;
  const trimmed = redact(message.trim()).slice(0, 120);
  return trimmed || undefined;
}

export async function throwForStatus(res: Response): Promise<void> {
  if (res.ok) return;
  throw errorFromStatus(res.status, await readErrorDetail(res));
}
