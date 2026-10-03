import { useState, useMemo, useRef, useEffect } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { convexErrorData } from "../../../convex/lib/errorData";
import { normalizeQuestionTags } from "../../../convex/lib/questionTags";
import {
	ERROR_CODES,
	ERROR_MESSAGES,
	MAX_QUESTION_TAG_LENGTH,
	MAX_QUESTION_TAGS,
} from "../../../convex/constants";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { Loader2, Sparkles, Trash2, RotateCcw, Save, X } from "lucide-react";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerDescription,
	DrawerFooter,
	DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Icon, IconComponent } from "@/components/ui/icons/icon";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "@/lib/utils";
import { useTeamWorkspace } from "@/hooks/useTeamWorkspace";

type RemixState = "idle" | "remixing" | "remixed";

interface RemixQuestionDrawerProps {
	question: Doc<"questions">;
	styleId: Id<"styles">;
	toneId: Id<"tones">;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onRemixed?: (originalQuestion: Doc<"questions">, newQuestion: Doc<"questions">) => void;
}

const CLOSE_ANIMATION_DURATION_MS = 500;


export function RemixQuestionDrawer({
	question,
	styleId,
	toneId,
	isOpen,
	onOpenChange,
	onRemixed,
}: RemixQuestionDrawerProps) {
	const [remixState, setRemixState] = useState<RemixState>("idle");
	const [remixedText, setRemixedText] = useState("");
	const [newQuestionId, setNewQuestionId] = useState<Id<"questions"> | null>(null);
	const [isPublic, setIsPublic] = useState(false);
	const [tagInput, setTagInput] = useState("");
	const [tags, setTags] = useState<string[]>([]);
	const [saveFailed, setSaveFailed] = useState(false);
	const [focusedSuggestionIndex, setFocusedSuggestionIndex] = useState(-1);
	const { activeWorkspace, isEntitlementsLoading, teamWorkspaceId } = useTeamWorkspace();

	const styles = useQuery(
		api.core.styles.getStyles,
		isOpen ? { organizationId: teamWorkspaceId } : "skip",
	);
	const tones = useQuery(
		api.core.tones.getTones,
		isOpen ? { organizationId: teamWorkspaceId } : "skip",
	);
	const allAvailableTags = useQuery(api.core.tags.getTags, isOpen ? {} : "skip");

	const filteredSuggestions = useMemo(() => {
		if (!tagInput.trim()) return [];
		return allAvailableTags?.filter(t => 
			t.name.toLowerCase().includes(tagInput.toLowerCase()) && 
			!tags.includes(t.name)
		).slice(0, 10) || [];
	}, [allAvailableTags, tagInput, tags]);

	// Style / tone selection (default to the question's current values)
	const [selectedStyleId, setSelectedStyleId] = useState<Id<"styles"> | undefined>(styleId);
	const [selectedToneId, setSelectedToneId] = useState<Id<"tones"> | undefined>(toneId);

	const questionStyle = useQuery(api.core.styles.getStyleById, isOpen && styleId ? { id: styleId } : "skip");
	const questionTone = useQuery(api.core.tones.getToneById, isOpen && toneId ? { id: toneId } : "skip");
	const style = selectedStyleId
		? styles?.find((s) => s._id === selectedStyleId) ?? null
		: questionStyle;
	const tone = selectedToneId
		? tones?.find((t) => t._id === selectedToneId) ?? null
		: questionTone;

	const currentUser = useQuery(
		api.core.users.getCurrentUser,
		isOpen ? { organizationId: activeWorkspace ?? undefined } : "skip"
	);
	const remixQuestion = useAction(api.core.questions.remixQuestionForUser);
	const addPersonalQuestion = useMutation(api.core.questions.addPersonalQuestion);
	const updatePersonalQuestion = useMutation(api.core.questions.updatePersonalQuestion);
	const deletePersonalQuestion = useMutation(api.core.questions.deletePersonalQuestion);

	const isClosingRef = useRef(false);
	// Bumped on every remix start, cancel, reset and unmount. A run whose id is no longer current
	// was cancelled or replaced, so it must not save anything or touch the drawer's state.
	const remixRequestIdRef = useRef(0);
	useEffect(() => () => {
		remixRequestIdRef.current += 1;
	}, []);
	// Cancel removes the focused button, so move focus to what replaces it.
	const focusAfterCancelRef = useRef(false);
	const remixButtonRef = useRef<HTMLButtonElement>(null);
	const saveButtonRef = useRef<HTMLButtonElement>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (!focusAfterCancelRef.current || remixState === "remixing") return;
		focusAfterCancelRef.current = false;
		if (remixState === "remixed") {
			saveButtonRef.current?.focus();
		} else {
			// The cancelled run may have used the last AI credit, which disables Remix.
			const remixButton = remixButtonRef.current;
			(remixButton && !remixButton.disabled ? remixButton : closeButtonRef.current)?.focus();
		}
	}, [remixState]);

	const hasChanges = useMemo(() => {
		const styleChanged = selectedStyleId !== styleId;
		const toneChanged = selectedToneId !== toneId;
		const initialTags = question?.tags || [];
		const tagsChanged = tags.length !== initialTags.length || 
						  !tags.every(t => initialTags.includes(t)) ||
						  !initialTags.every(t => tags.includes(t));
		
		return remixState === "remixed" || styleChanged || toneChanged || tagsChanged;
	}, [remixState, selectedStyleId, styleId, selectedToneId, toneId, tags, question?.tags]);

	// Reset state when drawer opens/closes
	const handleOpenChange = (open: boolean) => {
		if (isClosingRef.current) return;

		if (!open && (hasChanges || remixState === "remixing") && remixState !== "idle") {
			if (remixState === "remixing") {
				toast.warning("Please wait for the remix to finish or cancel it.", {
					id: "remix-in-progress"
				});
				return;
			}
			toast.warning("Please save or discard your changes.", {
				id: "remix-unsaved-changes",
				description: remixState === "remixed" 
					? "A remixed draft has been created."
					: "You have adjusted filters or tags."
			});
			return;
		}

		if (open && !isOpen) {
			// Initialize selections from the current question
			setSelectedStyleId(styleId);
			setSelectedToneId(toneId);
			setTags(question?.tags || []);
		}

		onOpenChange(open);
	};

	const forceClose = () => {
		isClosingRef.current = true;
		onOpenChange(false);
		// isClosingRef.current will be reset in onClose or handleAnimationEnd
		// We add a safety timeout just in case onClose doesn't trigger
		setTimeout(() => {
			isClosingRef.current = false;
		}, CLOSE_ANIMATION_DURATION_MS);
	};

	const resetState = () => {
		remixRequestIdRef.current += 1;
		setRemixState("idle");
		setRemixedText("");
		setNewQuestionId(null);
		setIsPublic(false);
		setTagInput("");
		setTags([]);
		setSelectedStyleId(styleId);
		setSelectedToneId(toneId);
		setSaveFailed(false);
		setFocusedSuggestionIndex(-1);
	};

	const handleRemix = async () => {
		if (!question) return;
		if (!newQuestionId && isEntitlementsLoading) {
			toast.error("Checking workspace access. Please try again in a moment.");
			return;
		}
		// Check the tags the save will send before the remix uses an AI request.
		try {
			normalizeQuestionTags(tags);
		} catch (error) {
			const dataMessage = convexErrorData(error)?.message;
			toast.error(typeof dataMessage === "string" ? dataMessage : "These tags can't be saved.");
			return;
		}
		const requestId = ++remixRequestIdRef.current;
		const isStale = () => remixRequestIdRef.current !== requestId;
		setRemixState("remixing");
		setSaveFailed(false);
		try {
			const text = await remixQuestion({ 
				questionId: question._id,
				styleId: selectedStyleId,
				toneId: selectedToneId,
				topicId: question.topicId,
			});
			// Cancelled while the AI was writing: save nothing.
			if (isStale()) return;

			let currentId = newQuestionId;
			if (!currentId) {
				// First remix — create a new private question
				const id = await addPersonalQuestion({
					customText: text,
					isPublic: false,
					styleId: selectedStyleId,
					toneId: selectedToneId,
					topicId: question.topicId,
					tags,
					organizationId: teamWorkspaceId,
				});
				if (isStale()) {
					// Cancelled while the question was being created. Nothing will show it or offer
					// Discard, so remove it rather than leave it in the person's stash.
					if (id) {
						deletePersonalQuestion({ questionId: id }).catch(() => {});
					}
					return;
				}
				if (id) {
					setNewQuestionId(id);
					currentId = id;
				}
			} else {
				// Subsequent remix — update the existing new question
				await updatePersonalQuestion({
					questionId: currentId,
					customText: text,
					isPublic: false,
					styleId: selectedStyleId,
					toneId: selectedToneId,
					topicId: question.topicId,
					tags,
				});
				// Cancelled while the update was in flight. The question may now hold the cancelled
				// text, but the drawer keeps showing the previous remix, and Save writes that text
				// back (Discard deletes the question), so leave the server copy alone.
				if (isStale()) return;
			}

			// Show the remix only once it is saved, so Save never sends text the server refused.
			setRemixedText(text);
			setRemixState("remixed");
		} catch (error) {
			if (isStale()) return;
			// A ConvexError carries a readable message in its data (e.g. the AI budget is paused).
			// The AI wrote an over-long remix, not the person, so point them to remixing again.
			const errorData = convexErrorData(error);
			const dataMessage = errorData?.code === ERROR_CODES.QUESTION_TEXT_TOO_LONG
				? ERROR_MESSAGES.AI_REMIX_RESULT_TOO_LONG
				: errorData?.message;
			const message = typeof dataMessage === "string" ? dataMessage : error instanceof Error ? error.message : String(error);
			toast.error(`Remix failed: ${message}`);
			setSaveFailed(true);
			setRemixState(remixedText ? "remixed" : "idle");
		}
	};

	const handleCancelRemix = () => {
		remixRequestIdRef.current += 1;
		focusAfterCancelRef.current = true;
		// Go back to the previous remix if there is one, so it can still be saved or discarded.
		setRemixState(remixedText ? "remixed" : "idle");
	};

	const handleSave = async () => {
		if (!newQuestionId) return;
		try {
			const updatedQuestion = await updatePersonalQuestion({
				questionId: newQuestionId,
				customText: remixedText,
				isPublic,
				styleId: selectedStyleId,
				toneId: selectedToneId,
				topicId: question.topicId,
				tags,
			});
			if (updatedQuestion && onRemixed) {
				onRemixed(question, updatedQuestion as Doc<"questions">);
			}
			toast.success(isPublic ? "Question submitted for review!" : "Remixed question saved to your stash!");
			forceClose();
		} catch (error) {
			const dataMessage = convexErrorData(error)?.message;
			toast.error(typeof dataMessage === "string" ? dataMessage : "Failed to save remixed question.");
		}
	};

	const handleDiscard = async () => {
		if (newQuestionId) {
			try {
				await deletePersonalQuestion({ questionId: newQuestionId });
			} catch {
				// If delete fails, still close
			}
		}
		forceClose();
	};

	const handleAddTag = (tagName?: string) => {
		const tagToAdd = (tagName || tagInput).trim().toLowerCase();
		if (!tagToAdd) return;
		
		const tagExists = allAvailableTags?.some(t => t.name.toLowerCase() === tagToAdd);
		if (!tagExists) {
			toast.error(`"${tagToAdd}" is not a valid tag. Please select from the list.`);
			return;
		}

		if (!tags.includes(tagToAdd)) {
			// The same limits the server checks on save. A picked suggestion skips the input's cap.
			if (tagToAdd.length > MAX_QUESTION_TAG_LENGTH) {
				toast.error(ERROR_MESSAGES.QUESTION_TAG_TOO_LONG);
				return;
			}
			if (tags.length >= MAX_QUESTION_TAGS) {
				toast.error(ERROR_MESSAGES.QUESTION_TAGS_TOO_MANY);
				return;
			}
			setTags([...tags, tagToAdd]);
		}
		setTagInput("");
	};

	const handleRemoveTag = (tag: string) => {
		setTags(tags.filter((t) => t !== tag));
	};

	if (!question) return null;

	const questionText = question.text ?? question.customText ?? "No question text";

	return (
		<Drawer 
			open={isOpen} 
			onOpenChange={handleOpenChange}
			onClose={() => {
				if (!isOpen) {
					resetState();
					isClosingRef.current = false;
				}
			}}
		>
			<DrawerContent onAnimationEnd={() => {
				// Fallback cleanup if onClose didn't fire
				if (!isOpen) {
					resetState();
					isClosingRef.current = false;
				}
			}}>
				<DrawerHeader>
					<DrawerTitle className="flex items-center gap-2 justify-between">
						<span className="flex items-center gap-2">							
							Remix Question
						</span>
						{currentUser && (
							<span className={`flex items-center gap-2 text-xs font-normal ${currentUser.isAiLimitReached ? "text-red-500" : "text-muted-foreground"}`}>
								{currentUser.aiUsage?.count ?? 0}/{currentUser.aiLimit} 
								<Sparkles className={cn(
									`size-4`, 
									currentUser.aiLimit - (currentUser.aiUsage?.count ?? 0) <= 3 ? "text-yellow-500" : "",
									currentUser.isAiLimitReached ? "text-red-500" : ""
								)} /> 
								{currentUser.isAiLimitReached ? <Badge 
																			onClick={() => {
																				window.location.href = "/pricing?source=remix_limit";
																			}}
																			variant="outline"
																			className="cursor-pointer"
																			>
																				Start Team plan
																			</Badge> : "AI generations"}
							</span>
						)}
					</DrawerTitle>
					<DrawerDescription>
						Create your own spin on this question
					</DrawerDescription>
				</DrawerHeader>

				<div className="px-4 pb-6 space-y-6 max-h-[70vh] overflow-y-auto">
					{/* Original question */}
					<div className="rounded-lg border bg-muted/50 p-3">
						<p className="text-xs font-medium text-muted-foreground mb-1">Original</p>
						<p className="text-sm font-medium">{questionText}</p>
						
						{questionStyle && (
							<Badge
								variant="outline"
								className="gap-1 text-xs py-0.5"
								style={{ borderColor: `${questionStyle.color}40`, color: questionStyle.color }}
							>
								<IconComponent icon={questionStyle.icon as Icon} size={12} color={questionStyle.color} />
								{questionStyle.name}
							</Badge>
						)}
						{questionTone && (
							<Badge
								variant="outline"
								className="gap-1 text-xs py-0.5"
								style={{ borderColor: `${questionTone.color}40`, color: questionTone.color }}
							>
								<IconComponent icon={questionTone.icon as Icon} size={12} color={questionTone.color} />
								{questionTone.name}
							</Badge>
						)}
					</div>

					{/* Remixed result */}
					{remixState === "remixing" && (
						<div className="flex items-center justify-center py-6">
							<Loader2 className="size-6 animate-spin text-blue-500" />
							<span className="ml-2 text-sm text-muted-foreground">Remixing with AI…</span>
						</div>
					)}

					{remixState === "remixed" && remixedText && (
						<div className="rounded-lg border-2 border-blue-500/30 bg-blue-500/5 p-3">
							<p className="text-xs font-medium text-blue-500 mb-1">Remixed</p>
							<p className="text-sm font-medium">{remixedText}</p>
						</div>
					)}

					{/* Style / Tone selectors */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
						<div className="space-y-2.5">
							<Label className="text-xs font-medium">Style</Label>
							<select
								value={selectedStyleId ?? ""}
								onChange={(e) => setSelectedStyleId(e.target.value === "" ? undefined : e.target.value as Id<"styles">)}
								className="w-full h-11 rounded-lg border bg-background px-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
							>
								<option value="">Current</option>
								{styles?.map((s) => (
									<option key={s.id} value={s._id}>
										{s.name}
									</option>
								))}
							</select>
							{style && (
								<div className="flex items-center gap-2">
									<Badge
										variant="outline"
										className="gap-1 text-xs py-0.5"
										style={{ borderColor: `${style.color}40`, color: style.color }}
									>
										<IconComponent icon={style.icon as Icon} size={12} color={style.color} />
										{style.name}
									</Badge>
									<Popover>
										<PopoverTrigger>
											<Badge
												variant="outline"
												className="gap-1 text-xs py-0.5"
												style={{ borderColor: `${style.color}40`, color: style.color }}
											>
												<IconComponent icon="Info" size={12} color={style.color} />
											</Badge>
										</PopoverTrigger>
										<PopoverContent>
											<p className="text-xs font-medium">{style.description}</p>
										</PopoverContent>
									</Popover>
								</div>
							)}
						</div>
						<div className="space-y-2.5">
							<Label className="text-xs font-medium">Tone</Label>
							<select
								value={selectedToneId ?? ""}
								onChange={(e) => setSelectedToneId(e.target.value === "" ? undefined : e.target.value as Id<"tones">)}
								className="w-full h-11 rounded-lg border bg-background px-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
							>
								<option value="">Current</option>
								{tones?.map((t) => (
									<option key={t.id} value={t._id}>
										{t.name}
									</option>
								))}
							</select>
							{tone && (
								<div className="flex items-center gap-2">
								<Badge
									variant="outline"
									className="gap-1 text-xs py-0.5"
									style={{ borderColor: `${tone.color}40`, color: tone.color }}
								>
									<IconComponent icon={tone.icon as Icon} size={12} color={tone.color} />
									{tone.name}
								</Badge>
								<Popover>
									<PopoverTrigger>
										<Badge
											variant="outline"
											className="gap-1 text-xs py-0.5"
											style={{ borderColor: `${tone.color}40`, color: tone.color }}
										>
											<IconComponent icon="Info" size={12} color={tone.color} />
										</Badge>
									</PopoverTrigger>
									<PopoverContent>
										<p className="text-xs font-medium">{tone.description}</p>
									</PopoverContent>
								</Popover>
							</div>
							)}
						</div>
					</div>

					{/* Tags Section */}
					<div className="space-y-2.5">
						<Label className="text-xs font-medium text-muted-foreground">Tags</Label>
						<div className="flex flex-wrap gap-1.5 p-2.5 border rounded-lg bg-background focus-within:ring-2 focus-within:ring-primary/20 min-h-[48px]">
							{tags.map((tag) => (
								<Badge key={tag} variant="secondary" className="gap-1 pl-2 pr-1 py-0.5 text-[10px] h-6">
									{tag}
									<Button
										variant="ghost"
										size="icon"
										className="h-3 w-3 p-0 hover:bg-transparent"
										onClick={() => handleRemoveTag(tag)}
									>
										<X className="size-2" />
									</Button>
								</Badge>
							))}
							<input
								placeholder={tags.length === 0 ? "Add tags (e.g. food, travel)..." : ""}
								value={tagInput}
								maxLength={MAX_QUESTION_TAG_LENGTH}
								onChange={(e) => setTagInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										if (focusedSuggestionIndex >= 0 && filteredSuggestions[focusedSuggestionIndex]) {
											handleAddTag(filteredSuggestions[focusedSuggestionIndex].name);
										} else if (filteredSuggestions.length > 0) {
											handleAddTag(filteredSuggestions[0].name);
										} else {
											handleAddTag();
										}
									} else if (e.key === "ArrowRight") {
										setFocusedSuggestionIndex(prev => 
											prev < filteredSuggestions.length - 1 ? prev + 1 : prev
										);
									} else if (e.key === "ArrowLeft") {
										setFocusedSuggestionIndex(prev => 
											prev > 0 ? prev - 1 : prev
										);
									} else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
										handleRemoveTag(tags[tags.length - 1]);
									}
								}}
								className="flex-1 bg-transparent border-none outline-none text-sm min-w-[80px] h-6"
								aria-autocomplete="list"
								aria-haspopup="listbox"
								aria-expanded={tagInput && filteredSuggestions.length > 0 ? "true" : "false"}
							/>
						</div>
						{tagInput && filteredSuggestions.length > 0 && (
							<div 
								className="flex flex-wrap gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200 mt-2"
								role="listbox"
								aria-label="Tag suggestions"
							>
								{filteredSuggestions.map((s, index) => (
									<Badge
										key={s._id}
										variant="outline"
										role="option"
										tabIndex={0}
										aria-selected={focusedSuggestionIndex === index}
										className={cn(
											"cursor-pointer hover:bg-muted text-[10px] py-0.5 px-2 font-normal border-dashed",
											focusedSuggestionIndex === index ? "bg-primary/10 border-primary ring-1 ring-primary/20" : "border-primary/30"
										)}
										onClick={() => handleAddTag(s.name)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleAddTag(s.name);
											}
										}}
										onMouseEnter={() => setFocusedSuggestionIndex(index)}
									>
										+ {s.name}
									</Badge>
								))}
							</div>
						)}
					</div>

					{/* Private / Submit toggle */}
					{remixState === "remixed" && (
						<div className="flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border dark:border-gray-800">
							<Switch
								id="remix-public-toggle"
								checked={isPublic}
								onCheckedChange={setIsPublic}
							/>
							<div className="space-y-0.5">
								<Label htmlFor="remix-public-toggle" className="text-sm cursor-pointer">
									{isPublic ? "Submit for review" : "Keep private"}
								</Label>
								<p className="text-[10px] text-gray-500 dark:text-gray-400">
									{isPublic
										? "Will be reviewed before being added to the public pool."
										: "Will be saved to your personal stash only."}
								</p>
							</div>
						</div>
					)}
				</div>

				<DrawerFooter className="gap-3 pt-4">
					{remixState === "idle" && (
						<>
							<Button 
								ref={remixButtonRef}
								onClick={handleRemix} 
								className="gap-2"
								disabled={currentUser?.isAiLimitReached || isEntitlementsLoading}
							>
								<Sparkles className="size-4" />
								Remix
							</Button>
							<DrawerClose asChild>
								<Button ref={closeButtonRef} variant="ghost">Cancel</Button>
							</DrawerClose>
						</>
					)}

					{remixState === "remixing" && (
						<div className="flex flex-col gap-2 w-full">
							<Button disabled className="gap-2">
								<Loader2 className="size-4 animate-spin" />
								Remixing…
							</Button>
							<Button variant="ghost" onClick={handleCancelRemix}>
								{remixedText ? "Keep Previous Remix" : "Cancel Remix"}
							</Button>
						</div>
					)}

					{remixState === "remixed" && (
						<>
							<Button ref={saveButtonRef} onClick={handleSave} className="gap-2">
								<Save className="size-4" />
								Save
							</Button>
							<Button 
								variant="outline" 
								onClick={handleRemix} 
								className="gap-2"
								disabled={currentUser?.isAiLimitReached}
							>
								<RotateCcw className="size-4" />
								Remix Again
							</Button>
							<Button variant="ghost" onClick={handleDiscard} className="gap-2 text-destructive hover:text-destructive">
								<Trash2 className="size-4" />
								Discard
							</Button>
						</>
					)}
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
