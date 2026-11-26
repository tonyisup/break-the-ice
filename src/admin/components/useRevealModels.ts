import * as React from "react";

const KEY = "admin.revealModels";
const EVENT = "admin-reveal-models";

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Whether model names show on the generator and in the review queue. Off by default (blind):
 * models show as "Model A" and so on, so knowing the model doesn't sway a review. Kept in this
 * browser and shared by every admin page that is open.
 */
export function useRevealModels(): [boolean, (reveal: boolean) => void] {
  const [reveal, setReveal] = React.useState(read);
  React.useEffect(() => {
    const sync = () => setReveal(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = React.useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(KEY, String(next));
    } catch {
      // Private browsing may refuse storage; the switch still works for this page.
    }
    setReveal(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [reveal, update];
}
