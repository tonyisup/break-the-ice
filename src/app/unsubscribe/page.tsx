"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@clerk/clerk-react";
import { Header } from "@/components/header";
import { useTheme } from "../../hooks/useTheme";
import { toast } from "sonner";
import { Loader2, Mail, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { NewsletterSubscribeResponse } from "@/types/newsletter";

const UnsubscribePage = () => {
	const [searchParams] = useSearchParams();
	const { isSignedIn, isLoaded } = useAuth();
	const { effectiveTheme } = useTheme();

	const currentUser = useQuery(api.core.users.getCurrentUser, {});
	const unsubscribeAction = useAction(api.core.resend.unsubscribeContact);
	const getStatusAction = useAction(api.core.resend.getContactStatus);
	const subscribeAction = useAction(api.core.newsletter.subscribe);

	const [email, setEmail] = useState<string | null>(null);
	const [formEmail, setFormEmail] = useState("");
	const [status, setStatus] = useState<"loading" | "subscribed" | "unsubscribed" | "unset" | "error" | "success_subscribed" | "verification_sent">("loading");
	const [isProcessing, setIsProcessing] = useState(false);

	useEffect(() => {
		// Determine the initial email to check
		let initialEmail: string | null = null;
		const emailParam = searchParams.get("email");

		if (emailParam) {
			initialEmail = emailParam;
		} else if (isLoaded && isSignedIn && currentUser?.email) {
			initialEmail = currentUser.email;
		}

		if (initialEmail) {
			setEmail(initialEmail);
			setFormEmail(initialEmail);
			checkStatus(initialEmail);
		} else if (isLoaded) {
			// Only set error if we're sure we're loaded and found nothing
			setStatus("error");
		}
	}, [searchParams, isLoaded, isSignedIn, currentUser]);

	const checkStatus = async (emailToCheck: string) => {
		setStatus("loading");
		try {
			const result = await getStatusAction({ email: emailToCheck });
			if (result.subscribed === true) {
				setStatus("subscribed");
			} else if (result.subscribed === false) {
				setStatus("unsubscribed");
			} else {
				setStatus("unset");
			}
		} catch (error) {
			console.error(error);
			setStatus("error");
		}
	};

	const handleUnsubscribe = async () => {
		if (!email) return;
		setIsProcessing(true);
		try {
			await unsubscribeAction({ email });
			setStatus("unsubscribed");
			toast.success("You have been unsubscribed from daily questions.");
		} catch (error) {
			console.error(error);
			toast.error("Failed to unsubscribe. Please try again later.");
		} finally {
			setIsProcessing(false);
		}
	};

	const handleSubscribe = async (e?: React.FormEvent) => {
		if (e) e.preventDefault();

		// Determine which email to use
		const targetEmail = isSignedIn && currentUser?.email ? currentUser.email : formEmail || email;

		if (!targetEmail) {
			toast.error("Please enter a valid email address.");
			return;
		}

		setIsProcessing(true);
		try {
			const result = (await subscribeAction({ email: targetEmail })) as NewsletterSubscribeResponse;

			if (result.status === "verification_required") {
				setStatus("verification_sent");
				toast.success("Verification email sent!");
			} else if (result.status === "error" || result.success === false) {
				setStatus("error");
				toast.error(result.message || "Subscription failed");
			} else {
				setStatus("success_subscribed");
				toast.success("Successfully subscribed!");
			}
		} catch (error) {
			console.error(error);
			toast.error("Failed to subscribe. Please try again.");
		} finally {
			setIsProcessing(false);
		}
	};

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
					<div className="flex justify-center">
						<div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center">
							<Mail className="w-10 h-10 text-blue-400" />
						</div>
					</div>

					<h1 className="text-3xl font-extrabold dark:text-white text-black">
						Newsletter Settings
					</h1>

					{status === "loading" && (
						<div className="flex flex-col items-center py-8">
							<Loader2 className="w-10 h-10 animate-spin text-blue-400 mb-4" />
							<p className="dark:text-white/70 text-black/70">Checking your subscription...</p>
						</div>
					)}

					{status === "subscribed" && (
						<div className="space-y-6 py-4">
							<p className="dark:text-white/80 text-black/80 text-lg">
								You are currently subscribed with: <br />
								<span className="font-bold text-blue-400">{email}</span>
							</p>
							<button
								onClick={handleUnsubscribe}
								disabled={isProcessing}
								className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-full py-4 text-lg font-bold shadow-lg transition-all hover:scale-105 flex items-center justify-center gap-2"
							>
								{isProcessing ? <Loader2 className="animate-spin" /> : "Unsubscribe from Daily Questions"}
							</button>
						</div>
					)}

					{status === "unsubscribed" && (
						<div className="space-y-6 py-4 animate-in fade-in zoom-in duration-500">
							<div className="flex justify-center">
								<CheckCircle2 className="w-16 h-16 text-green-400" />
							</div>
							<p className="dark:text-white/80 text-black/80 text-lg">
								You have been unsubscribed. <br />
								We're sorry to see you go!
							</p>

							<button
								onClick={() => handleSubscribe()}
								disabled={isProcessing}
								className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-full py-3 text-lg font-bold shadow-lg transition-all hover:scale-105 flex items-center justify-center gap-2 mb-4"
							>
								{isProcessing ? <Loader2 className="animate-spin" /> : "Mistake? Re-subscribe"}
							</button>

							<a
								href="/app"
								className="inline-block px-8 py-3 bg-white/10 hover:bg-white/20 rounded-full text-white/80 font-medium transition-colors text-sm"
							>
								Return Home
							</a>
						</div>
					)}

					{status === "success_subscribed" && (
						<div className="space-y-6 py-4 animate-in fade-in zoom-in duration-500">
							<div className="flex justify-center">
								<CheckCircle2 className="w-16 h-16 text-green-400" />
							</div>
							<p className="dark:text-white/80 text-black/80 text-lg">
								You're in! <br />
								Welcome to the Daily Questions.
							</p>
							<a
								href="/app"
								className="inline-block w-full bg-blue-500 hover:bg-blue-600 text-white rounded-full py-4 text-lg font-bold shadow-lg transition-all hover:scale-105"
							>
								Go to App
							</a>
						</div>
					)}

					{status === "verification_sent" && (
						<div className="space-y-6 py-4 animate-in fade-in zoom-in duration-500">
							<div className="flex justify-center">
								<Mail className="w-16 h-16 text-blue-400" />
							</div>
							<p className="dark:text-white/80 text-black/80 text-lg">
								Please check your email. <br />
								We sent a confirmation link to <b>{formEmail || email}</b>.
							</p>
							<a
								href="/app"
								className="inline-block w-full bg-blue-500 hover:bg-blue-600 text-white rounded-full py-4 text-lg font-bold shadow-lg transition-all hover:scale-105"
							>
								Go to App
							</a>
						</div>
					)}



					{(status === "error" || status === "unset") && (
						<div className="space-y-6 py-4">
							{(status === "error" && <div className="flex justify-center">
								<XCircle className="w-16 h-16 text-red-400" />
							</div>)}
							<p className="dark:text-white/80 text-black/80 text-lg">
								We couldn't find your subscription details.
							</p>

							<div className="bg-white/5 rounded-2xl p-6 border border-white/10">
								<p className="text-sm dark:text-white/70 text-black/70 mb-4">
									Would you like to subscribe instead?
								</p>

								{isSignedIn && currentUser?.email ? (
									<button
										onClick={() => handleSubscribe()}
										disabled={isProcessing}
										className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-full py-3 text-lg font-bold shadow-lg transition-all hover:scale-105 flex items-center justify-center gap-2"
									>
										{isProcessing ? <Loader2 className="animate-spin" /> : `Subscribe as ${currentUser.email}`}
									</button>
								) : (
									<form onSubmit={handleSubscribe} className="space-y-3">
										<input
											type="email"
											placeholder="Enter your email"
											value={formEmail}
											onChange={(e) => setFormEmail(e.target.value)}
											className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-black dark:text-white placeholder:text-black/50 dark:placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
											required
										/>
										<button
											type="submit"
											disabled={isProcessing}
											className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-full py-3 text-lg font-bold shadow-lg transition-all hover:scale-105 flex items-center justify-center gap-2"
										>
											{isProcessing ? <Loader2 className="animate-spin" /> : "Subscribe"}
										</button>
									</form>
								)}
							</div>

							<a
								href="/app"
								className="inline-flex items-center gap-2 text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors"
							>
								Go to App <ArrowRight size={14} />
							</a>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default UnsubscribePage;
