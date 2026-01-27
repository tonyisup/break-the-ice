"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Header } from "@/components/header";
import { useTheme } from "../../hooks/useTheme";
import { Loader2, CheckCircle2, XCircle, ArrowRight } from "lucide-react";

export default function VerifySubscriptionPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const confirmSubscription = useAction(api.newsletter.confirmSubscription);
  const { effectiveTheme } = useTheme();
  const navigate = useNavigate();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  // Prevent double firing in React Strict Mode
  const hasAttempted = useRef(false);

  useEffect(() => {
    const verify = async () => {
      if (!token) {
        setStatus("error");
        setErrorMessage("Missing verification token.");
        return;
      }

      if (hasAttempted.current) return;
      hasAttempted.current = true;

      try {
        await confirmSubscription({ token });
        setStatus("success");
      } catch (error) {
        console.error(error);
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Failed to verify subscription.");
      }
    };

    verify();
  }, [token, confirmSubscription]);

  const gradientLight = ["#667EEA", "#A064DE"];
  const gradientDark = ["#3B2554", "#262D54"];

  return (
    <div
      className="min-h-screen flex flex-col transition-colors overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${effectiveTheme === "dark" ? gradientDark[0] : gradientLight[0]}, ${effectiveTheme === "dark" ? gradientDark[1] : gradientLight[1]}, ${effectiveTheme === "dark" ? "#000" : "#fff"})`
      }}
    >
      <Header />

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl text-center space-y-6">

          <h1 className="text-3xl font-extrabold dark:text-white text-black">
            Subscription Verification
          </h1>

          {status === "loading" && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="w-10 h-10 animate-spin text-blue-400 mb-4" />
              <p className="dark:text-white/70 text-black/70">Verifying your subscription...</p>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-6 py-4 animate-in fade-in zoom-in duration-500">
              <div className="flex justify-center">
                <CheckCircle2 className="w-16 h-16 text-green-400" />
              </div>
              <p className="dark:text-white/80 text-black/80 text-lg">
                Subscription Confirmed! <br />
                You are now subscribed to the Daily Questions.
              </p>

              <button
                onClick={() => navigate("/app")}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-full py-4 text-lg font-bold shadow-lg transition-all hover:scale-105 flex items-center justify-center gap-2"
              >
                Go to App <ArrowRight size={20} />
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-6 py-4">
              <div className="flex justify-center">
                <XCircle className="w-16 h-16 text-red-400" />
              </div>
              <p className="dark:text-white/80 text-black/80 text-lg">
                Verification Failed.
              </p>
              <p className="dark:text-white/60 text-black/60 text-sm">
                {errorMessage}
              </p>

              <button
                onClick={() => navigate("/app")}
                 className="inline-block px-8 py-3 bg-white/10 hover:bg-white/20 rounded-full text-white/80 font-medium transition-colors text-sm"
              >
                Return Home
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
