import { useState, useMemo } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
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

type RemixState = "idle" | "remixing" | "remixed";

interface RemixQuestionDrawerProps {
	question: Doc<"questions">;
	styleId: Id<"styles">;
	toneId: Id<"tones">;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onRemixed?: (originalQuestion: Doc<"questions">, newQuestion: Doc<"questions">) => void;
}

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

	const styles = useQuery(api.core.styles.getStyles, isOpen ? {} : "skip");
	const tones = useQuery(api.core.tones.getTones, isOpen ? {} : "skip");
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

	const style = useQuery(api.core.styles.getStyleById, selectedStyleId && isOpen ? { id: selectedStyleId } : "skip");
	const tone = useQuery(api.core.tones.getToneById, selectedToneId && isOpen ? { id: selectedToneId } : "skip");

	const questionStyle = useQuery(api.core.styles.getStyleById, isOpen ? { id: styleId } : "skip");
	const questionTone = useQuery(api.core.tones.getToneById, isOpen ? { id: toneId } : "skip");

	const currentUser = useQuery(api.core.users.getCurrentUser, isOpen ? {} : "skip");
	const remixQuestion = useAction(api.core.questions.remixQuestionForUser);
	const addPersonalQuestion = useMutation(api.core.questions.addPersonalQuestion);
	const updatePersonalQuestion = useMutation(api.core.questions.updatePersonalQuestion);
	const deletePersonalQuestion = useMutation(api.core.questions.deletePersonalQuestion);

	// Reset state when drawer opens/closes
	const handleOpenChange = (open: boolean) => {
		if (!open) {
			resetState();
		} else {
			// Initialize selections from the current question
			setSelectedStyleId(styleId);
			setSelectedToneId(toneId);
			setTags(question?.tags || []);
		}
		onOpenChange(open);
	};

	const resetState = () => {
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
		setRemixState("remixing");
		setSaveFailed(false);
		try {
			const text = await remixQuestion({ 
				questionId: question._id,
				styleId: selectedStyleId,
				toneId: selectedToneId,
				topicId: question.topicId,
			});
			setRemixedText(text);

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
			}

			setRemixState("remixed");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			toast.error(`Remix failed: ${message}`);
			setSaveFailed(true);
			setRemixState(remixedText ? "remixed" : "idle");
		}
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
			handleOpenChange(false);
		} catch (error) {
			toast.error("Failed to save remixed question.");
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
		handleOpenChange(false);
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
		<Drawer open={isOpen} onOpenChange={handleOpenChange}>
			<DrawerContent>
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
																				toast.info("Upgrade flow coming soon!");
																			}}
																			variant="outline"
																			className="cursor-pointer"
																			>
																				Upgrade to continue
																			</Badge> : "AI generations"}
							</span>
						)}
					</DrawerTitle>
					<DrawerDescription>
						Create your own spin on this question
					</DrawerDescription>
				</DrawerHeader>

				<div className="px-4 pb-2 space-y-4 max-h-[60vh] overflow-y-auto">
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
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label className="text-xs font-medium">Style</Label>
							<select
								value={selectedStyleId ?? ""}
								onChange={(e) => setSelectedStyleId(e.target.value === "" ? undefined : e.target.value as Id<"styles">)}
								className="w-full h-9 rounded-lg border bg-background px-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
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
						<div className="space-y-1.5">
							<Label className="text-xs font-medium">Tone</Label>
							<select
								value={selectedToneId ?? ""}
								onChange={(e) => setSelectedToneId(e.target.value === "" ? undefined : e.target.value as Id<"tones">)}
								className="w-full h-9 rounded-lg border bg-background px-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
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
					<div className="space-y-1.5">
						<Label className="text-xs font-medium text-muted-foreground">Tags</Label>
						<div className="flex flex-wrap gap-1.5 p-2 border rounded-lg bg-background focus-within:ring-2 focus-within:ring-primary/20 min-h-[40px]">
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
								className="flex flex-wrap gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200 mt-1"
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
						<div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border dark:border-gray-800">
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

				<DrawerFooter>
					{remixState === "idle" && (
						<>
							<Button 
								onClick={handleRemix} 
								className="gap-2"
								disabled={currentUser?.isAiLimitReached}
							>
								<Sparkles className="size-4" />
								Remix
							</Button>
							<DrawerClose asChild>
								<Button variant="ghost">Cancel</Button>
							</DrawerClose>
						</>
					)}

					{remixState === "remixing" && (
						<Button disabled className="gap-2">
							<Loader2 className="size-4 animate-spin" />
							Remixing…
						</Button>
					)}

					{remixState === "remixed" && (
						<>
							<Button onClick={handleSave} className="gap-2">
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
