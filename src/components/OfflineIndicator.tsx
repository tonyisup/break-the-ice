import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

/** Shown inside the app header, so the header's measured height includes it and the
 *  sticky bars below move down instead of being covered. */
export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      className="flex w-full items-center justify-center gap-2 
                 bg-amber-800 text-white text-sm font-medium py-2 px-4 rounded-md"
      role="alert"
      aria-live="assertive"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>You&apos;re offline. New questions won&apos;t load until you reconnect.</span>
    </div>
  );
}
