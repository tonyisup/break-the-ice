import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useStorageContext } from "../hooks/useStorageContext";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, ShieldCheck, Info } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const CookieConsentBanner = () => {
  const { setHasConsented, revokeConsent } = useStorageContext();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if the user has already made a choice by looking at the cookie directly
    const consent = document.cookie
      .split("; ")
      .find((row) => row.startsWith("cookieConsent="));

    if (!consent) {
      // Small delay for a better entry feel
      const timer = setTimeout(() => setIsVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    setHasConsented(true);
    setIsVisible(false);
  };

  const handleDecline = () => {
    revokeConsent();
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 50, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", damping: 20, stiffness: 100 }}
          className="fixed bottom-6 left-6 right-6 z-[100] md:left-auto md:right-8 md:max-w-md"
        >
          <div className={cn(
            "relative overflow-hidden rounded-3xl border border-white/20 p-6 shadow-2xl backdrop-blur-2xl",
            "bg-white/90 dark:bg-slate-900/90 dark:border-white/10"
          )}>
            {/* Decorative background element */}
            <div className="absolute -right-4 -top-4 -z-10 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />

            <div className="flex gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Cookie className="h-6 w-6" />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                  Cookie Settings
                </h3>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  We use cookies and local storage to personalize your experience and analyze our traffic.
                  See our <Link to="/cookies" className="font-medium text-primary hover:underline">Cookie Policy</Link>.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDecline}
                className="h-10 px-4 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <Info className="mr-2 h-4 w-4" />
                Necessary only
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleAccept}
                className="h-10 px-6 font-semibold"
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                I understand
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CookieConsentBanner;

