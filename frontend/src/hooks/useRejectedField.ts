import { useCallback, useEffect, useState } from 'react';

/**
 * A form's own answer to a missing value, instead of the browser's validation bubble:
 * the first field a submit rejects gets a red outline (`aria-invalid`) and the cursor.
 * The outline lapses by itself once the value is valid, and the mark is cleared whenever
 * `resetKey` changes (pass the dialog's `open`).
 */
export function useRejectedField(resetKey?: unknown) {
  const [rejected, setRejected] = useState<string | null>(null);

  useEffect(() => {
    setRejected(null);
  }, [resetKey]);

  const reject = useCallback((id: string) => {
    setRejected(id);
    document.getElementById(id)?.focus();
  }, []);

  const isRejected = (id: string, stillInvalid: boolean) => rejected === id && stillInvalid;

  return { reject, isRejected };
}
