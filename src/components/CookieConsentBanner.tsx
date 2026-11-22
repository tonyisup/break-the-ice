import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useStorageContext } from "../hooks/useStorageContext";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, ShieldCheck, Info } from "lucide-react";
import { Button } from "./ui/button";

const CookieConsentBanner = () => {
  const { setHasConsented, revokeConsent } = useStorageContext();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = document.cookie
      .split("; ")
      .find((row) => row.startsWith("cookieConsent="));

    setIsVisible(!consent);
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
          initial={{ y: 80, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0, scale: 0.96 }}
          transition={{ type: "spring", damping: 22, stiffness: 140 }}
          className="fixed bottom-[calc(var(--bottom-nav-h,0px)+0.75rem)] left-3 right-3 z-[100] md:left-6 md:right-auto md:max-w-sm"
        >
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card/95 p-4 text-card-foreground shadow-2xl backdrop-blur-xl md:p-5">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary md:h-11 md:w-11">
                <Cookie className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-bold tracking-tight text-foreground">
                  Cookie Settings
                </h3>
                <p className="text-xs leading-relaxed text-muted-foreground md:text-sm">
                  We use necessary storage to run the site and optional analytics to understand traffic.
                  See our{" "}
                  <Link to="/cookies" className="font-semibold text-primary hover:underline">
                    Cookie Policy
                  </Link>
                  .
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDecline}
                className="h-10 rounded-full px-4 text-muted-foreground hover:text-foreground"
              >
                <Info className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Necessary only
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleAccept}
                className="h-10 rounded-full px-5 font-semibold"
              >
                <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Accept analytics
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CookieConsentBanner;
