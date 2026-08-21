import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PlaceholderPage } from "@/components/PlaceholderPage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { useStorageContext } from "@/hooks/useStorageContext";
import { useNavigate } from "react-router-dom";
import { siteConfig } from "@/config/site";

export const CONTACT_SUBMISSION_TIMEOUT_MS = 10_000;

const createSubmissionId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `feedback-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const withSubmissionTimeout = async <T,>(promise: Promise<T>): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("CONTACT_SUBMISSION_TIMEOUT")),
      CONTACT_SUBMISSION_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export default function ContactPage() {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const submissionIdRef = useRef<string | null>(null);
  const { sessionId } = useStorageContext();
  const submitFeedback = useMutation(api.core.feedback.submitFeedback);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setFormError("Please enter a message.");
      toast.error("Please enter a message.");
      return;
    }

    if (!navigator.onLine) {
      const offlineMessage = "You’re offline. Reconnect and try sending your message again.";
      setFormError(offlineMessage);
      toast.error(offlineMessage);
      return;
    }

    const submissionId = submissionIdRef.current ?? createSubmissionId();
    submissionIdRef.current = submissionId;
    setFormError(null);
    setIsSubmitting(true);
    try {
      await withSubmissionTimeout(
        submitFeedback({
          text: message.trim(),
          pageUrl: window.location.href,
          submissionId,
          sessionId,
        }),
      );
      toast.success("Thank you! Your message has been sent.");
      submissionIdRef.current = null;
      navigate("/thank-you", { replace: true });
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : "Failed to send message.";
      if (errorMessage.includes("recently")) {
        setFormError(errorMessage);
        toast.error(errorMessage);
      } else if (errorMessage === "CONTACT_SUBMISSION_TIMEOUT") {
        const timeoutMessage = "Sending is taking longer than expected. Check your connection and try again.";
        setFormError(timeoutMessage);
        toast.error(timeoutMessage);
      } else {
        const fallbackMessage = "We couldn’t send your message. Please try again.";
        setFormError(fallbackMessage);
        toast.error(fallbackMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PlaceholderPage title="Contact Us">
      <div className="space-y-6">
        <p className="text-muted-foreground">
          Have questions, suggestions, or found a bug? We'd love to hear from you.
          Use the form below to get in touch with our team.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 bg-card p-6 rounded-xl border shadow-sm">
          <div className="space-y-2">
            <Label htmlFor="message">Your Message</Label>
            <Textarea
              id="message"
              placeholder="How can we help you?"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setFormError(null);
                submissionIdRef.current = null;
              }}
              className="min-h-[150px] resize-none"
              aria-describedby={formError ? "contact-form-error" : undefined}
              aria-invalid={Boolean(formError)}
              required
            />
          </div>

          {formError && (
            <p
              id="contact-form-error"
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
            >
              {formError}
            </p>
          )}

          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={isSubmitting || !message.trim()}
          >
            {isSubmitting ? (
              "Sending..."
            ) : (
              <>
                Send Message
                <Send className="ml-2 w-4 h-4" />
              </>
            )}
          </Button>
        </form>

        <div className="pt-4 border-t space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-2">Other ways to connect</h2>
            <p className="text-sm text-muted-foreground">
              When you are signed in, you can also reach out to us via the feedback button at the bottom right of any screen.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-1">Direct Email</h3>
            <p className="text-sm text-muted-foreground">
              For more detailed inquiries or partnership opportunities, you can email us at:{" "}
              <a
                href={`mailto:${siteConfig.supportEmail}`}
                className="text-primary hover:underline font-medium"
              >
                {siteConfig.supportEmail}
              </a>
            </p>
          </div>
        </div>
      </div>
    </PlaceholderPage>
  );
}
