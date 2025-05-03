"use client";

import { useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { ArrowLeft, Heart, Trash2, Tag, Folder, Undo2, Redo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "~/components/ui/badge";
import { useState, useEffect } from "react";
import { useCardStack } from "~/app/_components/hooks/useCardStack";

export default function InspectCard() {
	const [skipped, setSkipped] = useState(false);
	const [liked, setLiked] = useState(false);
	const [categoryStatus, setCategoryStatus] = useState<"liked" | "skipped" | "none">("none");
	const [tagStatus, setTagStatus] = useState<Record<string, "liked" | "skipped" | "none">>({});

	const searchParams = useSearchParams();
	const router = useRouter();
	const id = searchParams.get("id");

	const {
		skips,
		likes,
		skipCategories,
		likeCategories,
		skipTags,
		likeTags,
		saveLikedQuestion,
		saveSkippedQuestion,
		saveLikedCategory,
		saveSkippedCategory,
		saveLikedTag,
		saveSkippedTag,
		removeSkippedQuestion,
		removeLikedQuestion,
		removeSkippedCategory,
		removeLikedCategory,
		removeSkippedTag,
		removeLikedTag
	} = useCardStack({
		drawCountDefault: 5,
		autoGetMoreDefault: false,
		advancedMode: false,
		initialQuestions: [],
		handleInspectCard: () => {}
	});

	const { data: question, isLoading, error } = api.questions.getById.useQuery(
		{ id: id ? parseInt(id) : 0 },
		{ enabled: !!id }
	);

	useEffect(() => {
		if (question) {
			setSkipped(skips.includes(question.id));
			setLiked(likes.includes(question.id));
			setCategoryStatus(question.category ? 
				likeCategories.includes(question.category) ? "liked" : 
				skipCategories.includes(question.category) ? "skipped" : 
				"none" : "none");
			
			const newTagStatus: Record<string, "liked" | "skipped" | "none"> = {};
			question.tags.forEach(({ tag }) => {
				newTagStatus[tag.name] = 
					likeTags.includes(tag.name) ? "liked" : 
					skipTags.includes(tag.name) ? "skipped" : 
					"none";
			});
			setTagStatus(newTagStatus);
		}
	}, [question, skips, likes, skipCategories, likeCategories, skipTags, likeTags]);

	const handleLike = () => {
		if (!question) return;
		saveLikedQuestion(question);
		setLiked(true);
	};

	const handleUnlike = () => {
		if (!question) return;
		removeLikedQuestion(question.id);
		setLiked(false);
	};

	const handleSkip = () => {
		if (!question) return;
		saveSkippedQuestion(question);
		setSkipped(true);
	};

	const handleUnskip = () => {
		if (!question) return;
		removeSkippedQuestion(question.id);
		setSkipped(false);
	};

	const handleCategoryLike = () => {
		if (!question?.category) return;
		saveLikedCategory(question.category);
		setCategoryStatus("liked");
	};

	const handleCategoryUnlike = () => {
		if (!question?.category) return;
		removeLikedCategory(question.category);
		setCategoryStatus("none");
	};

	const handleCategorySkip = () => {
		if (!question?.category) return;
		saveSkippedCategory(question.category);
		setCategoryStatus("skipped");
	};

	const handleCategoryUnskip = () => {
		if (!question?.category) return;
		removeSkippedCategory(question.category);
		setCategoryStatus("none");
	};

	const handleTagLike = (tagName: string) => {
		saveLikedTag(tagName);
		setTagStatus(prev => ({ ...prev, [tagName]: "liked" }));
	};

	const handleTagUnlike = (tagName: string) => {
		removeLikedTag(tagName);
		setTagStatus(prev => ({ ...prev, [tagName]: "none" }));
	};

	const handleTagSkip = (tagName: string) => {
		saveSkippedTag(tagName);
		setTagStatus(prev => ({ ...prev, [tagName]: "skipped" }));
	};

	const handleTagUnskip = (tagName: string) => {
		removeSkippedTag(tagName);
		setTagStatus(prev => ({ ...prev, [tagName]: "none" }));
	};

	if (isLoading) {
		return (
			<div className="min-h-screen p-4 flex flex-col items-center justify-center">
				<p>Loading...</p>
			</div>
		);
	}

	if (error || !question) {
		return (
			<div className="min-h-screen p-4 flex flex-col items-center justify-center">
				<p>Question not found</p>
				<Button onClick={() => router.push("/")} className="mt-4">
					<ArrowLeft className="mr-2" />
					Back to Home
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4 p-4">
			<div className="flex items-center gap-2">
				<Button variant="ghost" onClick={() => router.back()}>
					<ArrowLeft className="h-4 w-4" />
				</Button>
				<h1 className="text-2xl font-bold">Inspect Card</h1>
			</div>
			{isLoading && <div>Loading...</div>}
			{error && <div>Error loading question</div>}
			{question && (
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<h2 className="text-xl font-semibold">{question.text}</h2>
						<p>{question.text}</p>
					</div>
					<div className="flex flex-wrap gap-2">
						{question.category && (
							<div className="flex items-center gap-2">
								<Folder className="h-4 w-4" />
								<Badge variant={categoryStatus === "liked" ? "secondary" : categoryStatus === "skipped" ? "destructive" : "default"}>
									{question.category}
								</Badge>
								{categoryStatus === "none" ? (
									<div className="flex gap-1">
										<Button size="icon" variant="ghost" onClick={handleCategoryLike}>
											<Heart className="h-4 w-4" />
										</Button>
										<Button size="icon" variant="ghost" onClick={handleCategorySkip}>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								) : categoryStatus === "liked" ? (
									<Button size="icon" variant="ghost" onClick={handleCategoryUnlike}>
										<Undo2 className="h-4 w-4" />
									</Button>
								) : (
									<Button size="icon" variant="ghost" onClick={handleCategoryUnskip}>
										<Redo2 className="h-4 w-4" />
									</Button>
								)}
							</div>
						)}
						{question.tags.map(({ tag }) => (
							<div key={tag.name} className="flex items-center gap-2">
								<Tag className="h-4 w-4" />
								<Badge variant={tagStatus[tag.name] === "liked" ? "secondary" : tagStatus[tag.name] === "skipped" ? "destructive" : "default"}>
									{tag.name}
								</Badge>
								{tagStatus[tag.name] === "none" ? (
									<div className="flex gap-1">
										<Button size="icon" variant="ghost" onClick={() => handleTagLike(tag.name)}>
											<Heart className="h-4 w-4" />
										</Button>
										<Button size="icon" variant="ghost" onClick={() => handleTagSkip(tag.name)}>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								) : tagStatus[tag.name] === "liked" ? (
									<Button size="icon" variant="ghost" onClick={() => handleTagUnlike(tag.name)}>
										<Undo2 className="h-4 w-4" />
									</Button>
								) : (
									<Button size="icon" variant="ghost" onClick={() => handleTagUnskip(tag.name)}>
										<Redo2 className="h-4 w-4" />
									</Button>
								)}
							</div>
						))}
					</div>
					<div className="flex gap-2">
						{liked ? (
							<Button variant="ghost" onClick={handleUnlike}>
								<Undo2 className="h-4 w-4 mr-2" />
								Unlike
							</Button>
						) : (
							<Button variant="ghost" onClick={handleLike}>
								<Heart className="h-4 w-4 mr-2" />
								Like
							</Button>
						)}
						{skipped ? (
							<Button variant="ghost" onClick={handleUnskip}>
								<Redo2 className="h-4 w-4 mr-2" />
								Unskip
							</Button>
						) : (
							<Button variant="ghost" onClick={handleSkip}>
								<Trash2 className="h-4 w-4 mr-2" />
								Skip
							</Button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
