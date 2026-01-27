import React, { useState, useEffect } from 'react';
import { useAction } from "convex/react";
import { api } from '../../../convex/_generated/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Mail, Loader2, Check } from 'lucide-react';
import { NewsletterSubscribeResponse } from '@/types/newsletter';

interface NewsletterCardProps {
  variant: 'blend' | 'standout';
  prefilledEmail?: string;
}

export function NewsletterCard({ variant, prefilledEmail }: NewsletterCardProps) {
  const [email, setEmail] = useState(prefilledEmail || '');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'verification_required'>('idle');
  const subscribe = useAction(api.newsletter.subscribe);

  useEffect(() => {
    if (prefilledEmail) {
      setEmail(prefilledEmail);
    }
  }, [prefilledEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus('submitting');
    try {
      const result = (await subscribe({ email })) as NewsletterSubscribeResponse;

      if (result.status === "verification_required") {
        setStatus('verification_required');
        toast.success("Verification email sent!");
      } else {
        setStatus('success');
        toast.success("Successfully subscribed!");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to subscribe. Please try again.");
      setStatus('idle');
    }
  };

  // Common inner content styles
  const innerContentClass = "w-full h-full min-h-[300px] flex flex-col justify-center items-center p-8 transition-all duration-500 relative overflow-hidden";

  // Variant-specific styles
  const containerClass = variant === 'blend'
    ? "w-full h-full rounded-[30px] p-[3px] bg-gradient-to-br from-[#667EEA] to-[#764BA2]"
    : "w-full h-full rounded-[30px] p-[3px] bg-[#FF6B6B]"; // Standout solid color (e.g., coral red)

  const cardBgClass = variant === 'blend'
    ? "bg-white/95 dark:bg-gray-900/95 rounded-[27px]"
    : "bg-[#FF6B6B] text-white rounded-[27px]";

  const inputClass = variant === 'blend'
    ? "w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
    : "w-full px-4 py-3 rounded-xl border-2 border-white/30 bg-white/20 text-white placeholder:text-white/70 focus:ring-2 focus:ring-white focus:outline-none transition-all";

  const buttonClass = variant === 'blend'
    ? "w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-[#667EEA] to-[#764BA2] hover:opacity-90 transition-opacity disabled:opacity-70 flex justify-center items-center gap-2"
    : "w-full py-3 rounded-xl font-bold text-[#FF6B6B] bg-white hover:bg-white/90 transition-colors disabled:opacity-70 flex justify-center items-center gap-2 shadow-lg";

  const textColor = variant === 'blend' ? "text-gray-900 dark:text-white" : "text-white";
  const subTextColor = variant === 'blend' ? "text-gray-500 dark:text-gray-400" : "text-white/80";

  return (
    <div className="w-full max-w-md mx-auto relative group">
      {/* Developer Note */}
      <div className="absolute -top-6 left-0 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
        Variant: {variant}
      </div>

      <div className={containerClass}>
        <div className={cn(innerContentClass, cardBgClass)}>

          {/* Success/Verification State Overlay */}
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center transition-all duration-500 px-6",
              (status === 'success' || status === 'verification_required') ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            )}
          >
            <div className={cn("w-16 h-16 rounded-full flex items-center justify-center mb-4", variant === 'blend' ? "bg-green-100 text-green-600" : "bg-white/20 text-white")}>
              {status === 'verification_required' ? <Mail className="w-8 h-8" /> : <Check className="w-8 h-8" />}
            </div>
            <h3 className={cn("text-2xl font-bold mb-2 text-center", textColor)}>
              {status === 'verification_required' ? "Check your email" : "You're in!"}
            </h3>
            <p className={cn("text-center", subTextColor)}>
              {status === 'verification_required'
                ? "We've sent you a link to confirm your subscription."
                : "Check your inbox for a welcome email coming soon."}
            </p>
          </div>

          {/* Form State */}
          <div
            className={cn(
              "w-full flex flex-col items-center transition-all duration-500",
              (status === 'success' || status === 'verification_required') ? "opacity-0 translate-y-4 pointer-events-none" : "opacity-100 translate-y-0"
            )}
          >
            <div className={cn("mb-6 p-4 rounded-full", variant === 'blend' ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500" : "bg-white/20 text-white")}>
              <Mail size={32} />
            </div>

            <h2 className={cn("text-2xl font-bold text-center mb-2", textColor)}>
              Daily Questions?
            </h2>

            <p className={cn("text-center mb-8 px-4", subTextColor)}>
              Get a fresh question delivered to your inbox every morning.
            </p>

            <form onSubmit={handleSubmit} className="w-full space-y-4">
              {!prefilledEmail && (
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={status === 'submitting'}
                  className={inputClass}
                />
              )}
              <button
                type="submit"
                disabled={status === 'submitting'}
                className={buttonClass}
              >
                {status === 'submitting' ? (
                  <>
                    <Loader2 className="animate-spin w-5 h-5" />
                    Subscribing...
                  </>
                ) : (
                  prefilledEmail ? "Subscribe" : "Subscribe Now"
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
