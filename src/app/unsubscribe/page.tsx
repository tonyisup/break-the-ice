"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAction, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@clerk/clerk-react";
import { Header } from "@/components/header";
import { useTheme } from "../../hooks/useTheme";
import { toast } from "sonner";
import { Loader2, Mail, CheckCircle2, XCircle } from "lucide-react";

const UnsubscribePage = () => {
	const [searchParams] = useSearchParams();
	const { isSignedIn, isLoaded } = useAuth();
	const { effectiveTheme } = useTheme();

	const currentUser = useQuery(api.users.getCurrentUser, {});
	const unsubscribeAction = useAction(api.resend.unsubscribeContact);
	const getStatusAction = useAction(api.resend.getContactStatus);

	const [email, setEmail] = useState<string | null>(null);
	const [status, setStatus] = useState<"loading" | "subscribed" | "unsubscribed" | "error">("loading");
	const [isProcessing, setIsProcessing] = useState(false);

	useEffect(() => {
		const emailParam = searchParams.get("email");
		if (emailParam) {
			setEmail(emailParam);
		} else if (isLoaded && isSignedIn && currentUser?.email) {
			setEmail(currentUser.email);
		} else if (isLoaded && !isSignedIn && !emailParam) {
			setStatus("error");
		}
	}, [searchParams, isLoaded, isSignedIn, currentUser]);

	useEffect(() => {
		if (email) {
			checkStatus();
		}
	}, [email]);

	const checkStatus = async () => {
		if (!email) return;
		setStatus("loading");
		try {
			const result = await getStatusAction({ email });
			if (result.subscribed) {
				setStatus("subscribed");
			} else {
				setStatus("unsubscribed");
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
							<a
								href="/app"
								className="inline-block px-8 py-3 bg-white/20 hover:bg-white/30 rounded-full text-white font-medium transition-colors"
							>
								Return Home
							</a>
						</div>
					)}

					{status === "error" && (
						<div className="space-y-6 py-4">
							<div className="flex justify-center">
								<XCircle className="w-16 h-16 text-red-400" />
							</div>
							<p className="dark:text-white/80 text-black/80 text-lg">
								We couldn't find your subscription details.
							</p>
							<p className="text-sm dark:text-white/50 text-black/50">
								Please make sure you clicked the link correctly from your email or log in.
							</p>
							<a
								href="/app"
								className="inline-block px-8 py-3 bg-white/20 hover:bg-white/30 rounded-full text-white font-medium transition-colors"
							>
								Go to App
							</a>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default UnsubscribePage;
