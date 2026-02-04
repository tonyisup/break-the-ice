import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { PlaceholderPage } from "@/components/PlaceholderPage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { useStorageContext } from "@/hooks/useStorageContext";

export default function ContactPage() {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { sessionId } = useStorageContext();
  const submitFeedback = useMutation(api.feedback.submitFeedback);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Please enter a message.");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitFeedback({
        text: message,
        pageUrl: window.location.href,
        sessionId,
      });
      toast.success("Thank you! Your message has been sent.");
      setMessage("");
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : "Failed to send message.";
      if (errorMessage.includes("recently")) {
        toast.error(errorMessage);
      } else {
        toast.error("Failed to send message. Please try again.");
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
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[150px] resize-none"
              required
            />
          </div>

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
                href={`mailto:${import.meta.env.VITE_SUPPORT_EMAIL}`}
                className="text-primary hover:underline font-medium"
              >
                {import.meta.env.VITE_SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      </div>
    </PlaceholderPage>
  );
}
