import { useState, useRef, useEffect } from "react";
import { useMutation, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import { MessageCircle, X, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useStorageContext } from "@/hooks/useStorageContext";
import { Button } from "@/components/ui/button";

export default function FeedbackButton() {
  const { isAuthenticated } = useConvexAuth();
  const { sessionId } = useStorageContext();
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitFeedback = useMutation(api.core.feedback.submitFeedback);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        if (isOpen && text.trim() === "") {
          setIsOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, text]);

  if (!isAuthenticated) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setIsSubmitting(true);
    try {
      await submitFeedback({
        text,
        pageUrl: window.location.href,
        sessionId,
      });
      toast.success("Feedback submitted! Thank you.");
      setText("");
      setIsOpen(false);
    } catch (error) {
      console.error(error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to submit feedback.";
      if (errorMessage.includes("recently")) {
        toast.error(errorMessage);
      } else {
        toast.error("Failed to submit feedback. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed bottom-[calc(var(--bottom-nav-h,0px)+1rem)] right-4 z-50 flex flex-col items-end"
      ref={containerRef}
    >
      <AnimatePresence mode="wait">
        {isOpen ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="flex w-80 flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Send Feedback</h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="-m-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close feedback"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label="Your feedback"
                placeholder="What's on your mind?"
                className="h-24 w-full resize-none rounded-xl border border-input bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting || !text.trim()}
                  className="h-9 rounded-full px-4 font-semibold"
                >
                  {isSubmitting ? (
                    "Sending…"
                  ) : (
                    <>
                      Send <Send size={14} />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </motion.div>
        ) : (
          <motion.button
            key="button"
            type="button"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="group relative flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Open feedback form"
          >
            <MessageCircle size={20} />
            <span className="pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100">
              Send Feedback
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
