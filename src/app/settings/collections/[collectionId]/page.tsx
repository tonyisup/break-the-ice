"use client";

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { Header } from "@/components/header";
import { useTheme } from "@/hooks/useTheme";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MIN_SEARCH_LENGTH = 3;

export default function CollectionManagePage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const { isSignedIn } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { effectiveTheme } = useTheme();
  const collectionIdTyped = collectionId as Id<"collections">;

  const entitlements = useQuery(
    api.core.billing.getEffectiveEntitlements,
    activeWorkspace ? { organizationId: activeWorkspace } : "skip"
  );
  const collection = useQuery(
    api.core.collections.getCollectionDetail,
    collectionId && entitlements?.canUseTeamFeatures
      ? { collectionId: collectionIdTyped }
      : "skip"
  );

  const [nameDraft, setNameDraft] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [pendingQuestionId, setPendingQuestionId] = useState<Id<"questions"> | null>(null);

  const updateCollection = useMutation(api.core.collections.updateCollection);
  const addQuestionToCollection = useMutation(api.core.collections.addQuestionToCollection);
  const removeQuestionFromCollection = useMutation(api.core.collections.removeQuestionFromCollection);

  useEffect(() => {
    if (collection?.name) {
      setNameDraft(collection.name);
    }
  }, [collection?.name]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const excludeQuestionIds = useMemo(
    () => collection?.questions.map((q) => q._id) ?? [],
    [collection?.questions]
  );

  const searchResults = useQuery(
    api.core.collections.searchPublicQuestions,
    entitlements?.canUseTeamFeatures && debouncedSearch.length >= MIN_SEARCH_LENGTH
      ? { searchText: debouncedSearch, excludeQuestionIds }
      : "skip"
  );

  const gradientLight: [string, string] = ["#667EEA", "#A064DE"];
  const gradientDark: [string, string] = ["#3B2554", "#262D54"];

  const wrongWorkspace =
    collection &&
    (!activeWorkspace || collection.organizationId !== activeWorkspace);

  const canManage =
    isSignedIn &&
    entitlements?.canUseTeamFeatures &&
    activeWorkspace &&
    collection?.organizationId === activeWorkspace;

  const handleSaveName = async () => {
    if (!collectionId || !canManage) return;
    const normalized = nameDraft.trim();
    if (!normalized) {
      toast.error("Collection name cannot be empty");
      return;
    }
    if (normalized === collection?.name) return;

    setIsSavingName(true);
    try {
      await updateCollection({ collectionId: collectionIdTyped, name: normalized });
      toast.success("Collection renamed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to rename collection");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleAddQuestion = async (questionId: Id<"questions">) => {
    if (!collectionId || !canManage) return;
    setPendingQuestionId(questionId);
    try {
      await addQuestionToCollection({ questionId, collectionId: collectionIdTyped });
      toast.success("Question added to collection");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add question");
    } finally {
      setPendingQuestionId(null);
    }
  };

  const handleRemoveQuestion = async (questionId: Id<"questions">) => {
    if (!collectionId || !canManage) return;
    setPendingQuestionId(questionId);
    try {
      await removeQuestionFromCollection({ questionId, collectionId: collectionIdTyped });
      toast.success("Question removed from collection");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove question");
    } finally {
      setPendingQuestionId(null);
    }
  };

  return (
    <div
      className="min-h-screen transition-colors"
      style={{
        background: `linear-gradient(135deg, ${effectiveTheme === "dark" ? gradientDark[0] : gradientLight[0]}, ${effectiveTheme === "dark" ? gradientDark[1] : gradientLight[1]}, ${effectiveTheme === "dark" ? "#000" : "#fff"})`,
      }}
    >
      <Header homeLinkSlot="settings" />

      <div className="container mx-auto max-w-3xl p-4 md:p-8 pt-24 space-y-8">
        <Link
          to="/settings?expand=collections"
          className="inline-flex items-center gap-2 text-sm text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to collections
        </Link>

        {activeWorkspace && entitlements !== undefined && !entitlements?.canUseTeamFeatures ? (
          <section className="rounded-2xl border border-dashed border-amber-400/30 bg-amber-300/10 p-6 text-center">
            <h1 className="text-xl font-semibold dark:text-white text-black">Collections require Team</h1>
            <p className="mt-2 text-sm text-black/70 dark:text-white/70">
              Start an active Team subscription for this workspace to view or manage shared collections.
            </p>
            <Button asChild className="mt-4 bg-amber-400 text-slate-950 hover:bg-amber-300">
              <Link to="/pricing?source=collection_detail_gate">Upgrade to Team</Link>
            </Button>
          </section>
        ) : collection === undefined ? (
          <p className="text-black/60 dark:text-white/60">Loading collection…</p>
        ) : collection === null ? (
          <p className="text-black/60 dark:text-white/60">Collection not found.</p>
        ) : wrongWorkspace ? (
          <p className="text-black/60 dark:text-white/60">
            Switch to this collection&apos;s workspace to manage it.
          </p>
        ) : (
          <>
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
              <h1 className="text-2xl font-bold dark:text-white text-black">Collection</h1>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <label htmlFor="collection-name" className="text-sm text-black/60 dark:text-white/60">
                    Name
                  </label>
                  <Input
                    id="collection-name"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    disabled={!canManage || isSavingName}
                    className="border-white/10 bg-white/5"
                  />
                </div>
                <Button
                  onClick={() => void handleSaveName()}
                  disabled={!canManage || isSavingName || nameDraft.trim() === collection.name}
                  className="bg-slate-900 text-white hover:bg-slate-800"
                >
                  {isSavingName ? "Saving…" : "Save name"}
                </Button>
              </div>
              {!canManage && (
                <p className="text-sm text-amber-200/90">
                  Team workspace admin or manager access is required to edit this collection.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
              <h2 className="text-lg font-semibold dark:text-white text-black">
                Questions in collection ({collection.questions.length})
              </h2>
              {collection.questions.length === 0 ? (
                <p className="text-sm text-black/60 dark:text-white/60">
                  No questions yet. Search below to add public questions.
                </p>
              ) : (
                <ul className="space-y-3">
                  {collection.questions.map((question) => (
                    <li
                      key={question._id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/5 dark:bg-white/5 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium dark:text-white text-black">{question.text}</p>
                        {(question.style || question.tone || question.topic) && (
                          <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                            {[question.style, question.tone, question.topic].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                      {canManage && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          disabled={pendingQuestionId === question._id}
                          onClick={() => void handleRemoveQuestion(question._id)}
                          aria-label="Remove from collection"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
              <h2 className="text-lg font-semibold dark:text-white text-black">Add public questions</h2>
              <p className="text-sm text-black/60 dark:text-white/60">
                Search the public question pool (minimum {MIN_SEARCH_LENGTH} characters).
              </p>
              <Input
                placeholder="Search question text…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                disabled={!canManage}
                className="border-white/10 bg-white/5"
              />
              {searchInput.trim().length > 0 && searchInput.trim().length < MIN_SEARCH_LENGTH && (
                <p className="text-sm text-black/50 dark:text-white/50">
                  Type at least {MIN_SEARCH_LENGTH} characters to search.
                </p>
              )}
              {debouncedSearch.length >= MIN_SEARCH_LENGTH && searchResults === undefined && (
                <p className="text-sm text-black/50 dark:text-white/50">Searching…</p>
              )}
              {debouncedSearch.length >= MIN_SEARCH_LENGTH && searchResults?.length === 0 && (
                <p className="text-sm text-black/50 dark:text-white/50">No matching public questions found.</p>
              )}
              {searchResults && searchResults.length > 0 && (
                <ul className="space-y-3">
                  {searchResults.map((question) => (
                    <li
                      key={question._id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/5 dark:bg-white/5 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium dark:text-white text-black">{question.text}</p>
                        {(question.style || question.tone || question.topic) && (
                          <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                            {[question.style, question.tone, question.topic].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                      {canManage && (
                        <Button
                          type="button"
                          size="sm"
                          className={cn("shrink-0 gap-1 bg-slate-900 text-white hover:bg-slate-800")}
                          disabled={pendingQuestionId === question._id}
                          onClick={() => void handleAddQuestion(question._id)}
                        >
                          <Plus className="h-4 w-4" />
                          Add
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
