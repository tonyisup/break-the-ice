import { useState, useMemo, useRef, useEffect, useId } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { convexErrorData } from "../../../convex/lib/errorData";
import { normalizeQuestionTags } from "../../../convex/lib/questionTags";
import {
	ERROR_CODES,
	ERROR_MESSAGES,
	MAX_QUESTION_TAG_LENGTH,
	MAX_QUESTION_TAGS,
	MAX_QUESTION_TEXT_LENGTH,
} from "../../../convex/constants";
import { api } from "../../../convex/_generated/api";
import { AI_USAGE_CYCLE_MS } from "../../../convex/lib/aiPlanLimits";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { Loader2, Sparkles, Trash2, RotateCcw, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Icon, IconComponent } from "@/components/ui/icons/icon";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "@/lib/utils";

type RemixState = "idle" | "remixing" | "remixed";

interface RemixQuestionPanelProps {
	question: Doc<"questions">;
	styleId: Id<"styles">;
	toneId: Id<"tones">;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onRemixed?: (originalQuestion: Doc<"questions">, newQuestion: Doc<"questions">) => void;
}

/**
 * Remix a question in place: this is the back of the question card while it is open, and
 * renders nothing while it is closed. Closing is refused while a remix is running or a
 * draft is unsaved, so `onOpenChange(false)` is only called once it is safe to turn back.
 */
export function RemixQuestionPanel({
	question,
	styleId,
	toneId,
	isOpen,
	onOpenChange,
	onRemixed,
}: RemixQuestionPanelProps) {
	const [remixState, setRemixState] = useState<RemixState>("idle");
	const [remixedText, setRemixedText] = useState("");
	const [newQuestionId, setNewQuestionId] = useState<Id<"questions"> | null>(null);
	const [isPublic, setIsPublic] = useState(false);
	const [tagInput, setTagInput] = useState("");
	const [tags, setTags] = useState<string[]>([]);
	const [saveFailed, setSaveFailed] = useState(false);
	const [focusedSuggestionIndex, setFocusedSuggestionIndex] = useState(-1);
	// Tags come from a fixed list, so the list opens as soon as the field is used.
	const [showTagList, setShowTagList] = useState(false);
	// Asked to close with a draft that would be lost: the panel asks what to do with it.
	const [confirmingClose, setConfirmingClose] = useState(false);

	const styles = useQuery(api.core.styles.getStyles, isOpen ? {} : "skip");
	const tones = useQuery(api.core.tones.getTones, isOpen ? {} : "skip");
	const allAvailableTags = useQuery(api.core.tags.getTags, isOpen ? {} : "skip");

	const filteredSuggestions = useMemo(() => {
		const query = tagInput.trim().toLowerCase();
		return allAvailableTags?.filter(t =>
			!tags.includes(t.name) && (!query || t.name.toLowerCase().includes(query))
		).slice(0, 12) || [];
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

	const currentUser = useQuery(api.core.users.getCurrentUser, isOpen ? {} : "skip");
	const remixQuestion = useAction(api.core.questions.remixQuestionForUser);
	const addPersonalQuestion = useMutation(api.core.questions.addPersonalQuestion);
	const updatePersonalQuestion = useMutation(api.core.questions.updatePersonalQuestion);
	const deletePersonalQuestion = useMutation(api.core.questions.deletePersonalQuestion);

	const headingId = useId();
	const styleSelectId = useId();
	const toneSelectId = useId();
	const tagInputId = useId();
	const remixedTextId = useId();
	const keepEditingRef = useRef<HTMLButtonElement>(null);
	const beforeConfirmRef = useRef<HTMLElement | null>(null);
	const headingRef = useRef<HTMLHeadingElement>(null);
	// Bumped on every remix start, cancel, reset and unmount. A run whose id is no longer current
	// was cancelled or replaced, so it must not save anything or touch the panel's state.
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

	// Asked to open or close. Closing is refused while there is work that would be lost.
	const handleOpenChange = (open: boolean) => {
		if (!open && (hasChanges || remixState === "remixing") && remixState !== "idle") {
			if (remixState === "remixing") {
				toast.warning("Please wait for the remix to finish or cancel it.", {
					id: "remix-in-progress"
				});
				return;
			}
			beforeConfirmRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			setConfirmingClose(true);
			return;
		}

		onOpenChange(open);
	};

	// Close without the unsaved-work check: the work was just saved or discarded.
	const forceClose = () => onOpenChange(false);

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
		setShowTagList(false);
		setConfirmingClose(false);
	};

	// The discard question takes keyboard focus when it appears and gives it back when dismissed.
	useEffect(() => {
		if (confirmingClose) keepEditingRef.current?.focus();
	}, [confirmingClose]);
	const keepEditing = () => {
		setConfirmingClose(false);
		beforeConfirmRef.current?.focus();
	};

	// Opening starts from the question's own style, tone and tags and moves focus to the
	// heading; closing clears everything, which also drops a remix still in flight.
	useEffect(() => {
		if (isOpen) {
			setSelectedStyleId(styleId);
			setSelectedToneId(toneId);
			setTags(question?.tags || []);
			headingRef.current?.focus({ preventScroll: true });
		} else {
			resetState();
		}
		// Only opening and closing should run this, not edits made while the panel is open.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	const handleRemix = async () => {
		if (!question) return;
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
				});
				if (isStale()) {
					// Cancelled while the question was being created. Nothing will show it or offer
					// Discard, so remove it rather than leave it in My questions.
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
				// text, but the panel keeps showing the previous remix, and Save writes that text
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
		if (!remixedText.trim()) {
			toast.error(ERROR_MESSAGES.QUESTION_TEXT_REQUIRED);
			return;
		}
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
			toast.success(isPublic ? "Question submitted for review!" : "Remixed question saved to My questions");
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

	if (!question || !isOpen) return null;

	const questionText = question.text ?? question.customText ?? "No question text";

	const limitReached = !!currentUser?.isAiLimitReached;
	// The same reset date the feed's limit notice gives.
	const cycleStart = currentUser?.aiUsage?.cycleStart;
	const resetsOn = cycleStart === undefined ? null
		: new Date(cycleStart + AI_USAGE_CYCLE_MS).toLocaleDateString(undefined, { month: "long", day: "numeric" });

	return (
		<div
			role="group"
			aria-labelledby={headingId}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.stopPropagation();
					handleOpenChange(false);
				}
			}}
			className="flex h-full w-full flex-col gap-4 rounded-[27px] px-5 py-5 text-left text-gray-900 dark:text-white"
		>
			<div className="flex items-start justify-between gap-3">
				<div>
					<h3 id={headingId} ref={headingRef} tabIndex={-1} className="text-lg font-bold leading-tight outline-none">
						Remix Question
					</h3>
					<p className="text-sm text-muted-foreground">Create your own spin on this question</p>
				</div>
				{currentUser && (
					<span className={`flex shrink-0 items-center gap-1.5 text-xs ${limitReached ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
						{currentUser.aiUsage?.count ?? 0}/{currentUser.aiLimit}
						<Sparkles aria-hidden="true" className="size-4" />
						<span className="sr-only">AI generations used</span>
					</span>
				)}
			</div>

				<div className="space-y-5">
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
							<label htmlFor={remixedTextId} className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1 block">Remixed (you can edit it before saving)</label>
							<textarea
								id={remixedTextId}
								value={remixedText}
								onChange={(event) => setRemixedText(event.target.value)}
								maxLength={MAX_QUESTION_TEXT_LENGTH}
								rows={3}
								className="w-full resize-y rounded-md border bg-background p-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20"
							/>
						</div>
					)}

					{/* Style / Tone selectors */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
						<div className="space-y-2.5">
							<Label htmlFor={styleSelectId} className="text-xs font-medium">Style</Label>
							<select
								id={styleSelectId}
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
									<span className="text-xs text-muted-foreground">What this style means</span>
									<Popover>
										<PopoverTrigger
											aria-label={`About the ${style.name} style`}
											className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
										>
											<IconComponent icon="Info" size={18} color={style.color} />
										</PopoverTrigger>
										<PopoverContent>
											<p className="text-xs font-medium">{style.description}</p>
										</PopoverContent>
									</Popover>
								</div>
							)}
						</div>
						<div className="space-y-2.5">
							<Label htmlFor={toneSelectId} className="text-xs font-medium">Tone</Label>
							<select
								id={toneSelectId}
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
								<span className="text-xs text-muted-foreground">What this tone means</span>
								<Popover>
									<PopoverTrigger
										aria-label={`About the ${tone.name} tone`}
										className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
									>
										<IconComponent icon="Info" size={18} color={tone.color} />
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
						<Label htmlFor={tagInputId} className="text-xs font-medium text-muted-foreground">Tags</Label>
						<div className="flex flex-wrap gap-1.5 p-2.5 border rounded-lg bg-background focus-within:ring-2 focus-within:ring-primary/20 min-h-[48px]">
							{tags.map((tag) => (
								<Badge key={tag} variant="secondary" className="gap-0 pl-3 pr-0 py-0 text-xs">
									{tag}
									<button
										type="button"
										aria-label={`Remove tag ${tag}`}
										className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
										onClick={() => handleRemoveTag(tag)}
									>
										<X aria-hidden="true" className="size-4" />
									</button>
								</Badge>
							))}
							<input
								id={tagInputId}
								placeholder={tags.length === 0 ? "Choose tags from the list" : ""}
								onFocus={() => setShowTagList(true)}
								value={tagInput}
								maxLength={MAX_QUESTION_TAG_LENGTH}
								onChange={(e) => setTagInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										// Nothing typed and nothing highlighted: Enter adds nothing.
										if (!tagInput.trim() && focusedSuggestionIndex < 0) return;
										if (focusedSuggestionIndex >= 0 && filteredSuggestions[focusedSuggestionIndex]) {
											handleAddTag(filteredSuggestions[focusedSuggestionIndex].name);
										} else if (filteredSuggestions.length > 0) {
											handleAddTag(filteredSuggestions[0].name);
										} else {
											handleAddTag();
										}
									} else if (e.key === "ArrowDown" && filteredSuggestions.length > 0) {
										e.preventDefault();
										setFocusedSuggestionIndex(prev => 
											prev < filteredSuggestions.length - 1 ? prev + 1 : prev
										);
									} else if (e.key === "ArrowUp" && filteredSuggestions.length > 0) {
										e.preventDefault();
										setFocusedSuggestionIndex(prev => 
											prev > 0 ? prev - 1 : prev
										);
									} else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
										handleRemoveTag(tags[tags.length - 1]);
									}
								}}
								className="flex-1 bg-transparent border-none outline-none text-sm min-w-[80px] h-11"
								aria-autocomplete="list"
								aria-haspopup="listbox"
								aria-expanded={(showTagList || tagInput) && filteredSuggestions.length > 0 ? "true" : "false"}
							/>
						</div>
						{tagInput.trim() && filteredSuggestions.length === 0 && allAvailableTags && (
							<p role="status" className="text-xs text-muted-foreground">No tags match what you typed. Tags come from a fixed list.</p>
						)}
						{(showTagList || tagInput) && filteredSuggestions.length > 0 && (
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
											"min-h-11 cursor-pointer hover:bg-muted text-xs px-3 font-normal border-dashed",
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
								<p className="text-xs text-gray-600 dark:text-gray-300">
									{isPublic
										? "Will be reviewed before being added to the public pool."
										: "Will be saved to My questions only."}
								</p>
							</div>
						</div>
					)}
				</div>


			<div className="mt-auto flex flex-col gap-2 [&_button]:min-h-11">
				{confirmingClose && remixState === "remixed" && (
					<div role="alertdialog" aria-label="Discard this remix?" className="flex flex-col gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3">
						<p className="text-sm font-semibold">Discard this remix?</p>
						<p className="text-sm text-muted-foreground">It hasn't been saved. Save keeps it in My questions.</p>
						<div className="flex gap-2">
							<Button variant="ghost" onClick={handleDiscard} className="flex-1 text-destructive hover:text-destructive">Discard and close</Button>
							<Button ref={keepEditingRef} variant="outline" onClick={keepEditing} className="flex-1">Keep editing</Button>
						</div>
					</div>
				)}
				{limitReached && remixState !== "remixing" && (
					<p role="status" className="text-sm text-red-600 dark:text-red-400">
						You've used all your AI generations for this cycle, so Remix is off until {resetsOn ? `it resets on ${resetsOn}` : "it resets"}.
					</p>
				)}
					{remixState === "idle" && (
						<>
							<Button 
								ref={remixButtonRef}
								onClick={handleRemix} 
								className="gap-2 bg-gradient-to-r from-blue-600 to-purple-700 text-white hover:from-blue-700 hover:to-purple-800"
								disabled={currentUser?.isAiLimitReached}
							>
								<Sparkles className="size-4" />
								Remix
							</Button>
							<Button ref={closeButtonRef} variant="ghost" className="min-h-11" onClick={() => handleOpenChange(false)}>Cancel</Button>
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
							<Button ref={saveButtonRef} onClick={handleSave} className="gap-2 bg-gradient-to-r from-blue-600 to-purple-700 text-white hover:from-blue-700 hover:to-purple-800">
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
			</div>
		</div>
	);
}
