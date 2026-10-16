/** A PID is 7 digits of text. Leading zeros are part of it. */
export const PID_PATTERN = /^[0-9]{7}$/;

export type PidCheck =
  | { ok: true; pid: string; fixed: boolean }
  | { ok: false; reason: string };

/**
 * Normalize a PID read from a file or typed by a person.
 * 7 digits is valid. 6 digits gets one leading zero back (Excel drops it) and is reported as fixed.
 * Anything else is rejected with a reason.
 */
export function checkPid(raw: unknown): PidCheck {
  if (raw === null || raw === undefined) return { ok: false, reason: 'PID is blank' };
  const text = String(raw).trim();
  if (text === '') return { ok: false, reason: 'PID is blank' };
  if (!/^[0-9]+$/.test(text)) return { ok: false, reason: 'PID has characters that are not digits' };
  if (text.length === 7) return { ok: true, pid: text, fixed: false };
  if (text.length === 6) return { ok: true, pid: `0${text}`, fixed: true };
  return { ok: false, reason: `PID has ${text.length} digits, expected 7` };
}
