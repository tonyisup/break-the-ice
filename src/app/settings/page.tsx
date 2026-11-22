"use client";

import { useEffect, useState, useMemo } from "react";
import { useStorageContext } from "../../hooks/useStorageContext";
import { toast } from "sonner";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTheme } from "../../hooks/useTheme";
import { CollapsibleSection } from "../../components/collapsible-section/CollapsibleSection";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import DynamicIcon from "@/components/ui/dynamic-icon";
import {
  ItemDetailDrawer,
  ItemDetails,
} from "@/components/item-detail-drawer/item-detail-drawer";
import { SignInButton, useAuth } from "@clerk/clerk-react";
import { MAX_ANON_BLOCKED } from "../../hooks/useStorage";
import { SignInCTA } from "@/components/SignInCTA";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { ModernQuestionCard } from "@/components/modern-question-card/modern-question-card";

const SettingsPage = () => {
  const { isSignedIn } = useAuth();
  useTheme();
  const allStyles = useQuery(api.core.styles.getStyles, isSignedIn ? {} : "skip");
  const allTones = useQuery(api.core.tones.getTones, isSignedIn ? {} : "skip");
  const allGuestStyles =
    useQuery(api.core.styles.getStyles, isSignedIn ? "skip" : {}) ?? [];
  const allGuestTones =
    useQuery(api.core.tones.getTones, isSignedIn ? "skip" : {}) ?? [];
  const currentUser = useQuery(api.core.users.getCurrentUser, {});
  const [searchParams] = useSearchParams();
  const [confirmUnhideAllOpen, setConfirmUnhideAllOpen] = useState(false);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    subscription: true,
    "manage-styles": true,
    "hidden-questions": true,
  });

  useEffect(() => {
    const expand = searchParams.get("expand");
    if (expand) {
      const sections = expand.split(",");
      const newOpenSections: Record<string, boolean> = {};
      sections.forEach((s) => {
        newOpenSections[s.trim()] = true;
      });
      setOpenSections((prev) => ({ ...prev, ...newOpenSections }));
    }
  }, [searchParams]);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemDetails | null>(null);

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleShowInfo = (
    item: Doc<"styles"> | Doc<"tones">,
    type: "Style" | "Tone",
  ) => {
    setSelectedItem({
      id: item._id,
      slug: item.id,
      name: item.name,
      type,
      description: item.description ?? "",
      icon: item.icon as any,
      color: item.color,
    });
    setIsDrawerOpen(true);
  };

  const {
    hiddenStyles,
    setHiddenStyles,
    addHiddenStyle,
    removeHiddenStyle,
    hiddenTones,
    setHiddenTones,
    addHiddenTone,
    removeHiddenTone,
    hiddenQuestions,
    setHiddenQuestions,
    removeHiddenQuestion,
    clearHiddenQuestions,
    addLikedQuestion,
    storageLimitBehavior,
    setStorageLimitBehavior,
  } = useStorageContext();

  const handleToggleStyle = (styleId: Id<"styles">) => {
    if (hiddenStyles?.includes(styleId)) {
      removeHiddenStyle(styleId);
    } else {
      addHiddenStyle(styleId);
    }
  };

  const handleToggleTone = (toneId: Id<"tones">) => {
    if (hiddenTones?.includes(toneId)) {
      removeHiddenTone(toneId);
    } else {
      addHiddenTone(toneId);
    }
  };

  const unhideQuestion = (questionId: Id<"questions">) => {
    removeHiddenQuestion(questionId);
  };

  const stylesMap = useMemo(() => {
    const map = new Map<string, Doc<"styles">>();
    (allStyles ?? allGuestStyles).forEach((s) => {
      map.set(s.id, s as unknown as Doc<"styles">);
      map.set(s._id, s as unknown as Doc<"styles">);
    });
    return map;
  }, [allStyles, allGuestStyles]);

  const tonesMap = useMemo(() => {
    const map = new Map<string, Doc<"tones">>();
    (allTones ?? allGuestTones).forEach((t) => {
      map.set(t.id, t as unknown as Doc<"tones">);
      map.set(t._id, t as unknown as Doc<"tones">);
    });
    return map;
  }, [allTones, allGuestTones]);

  const hiddenQuestionObjects = useQuery(api.core.questions.getQuestionsByIds, {
    ids: hiddenQuestions,
  });

  const [lastKnownHiddenQuestions, setLastKnownHiddenQuestions] = useState<
    Doc<"questions">[] | undefined
  >(undefined);

  useEffect(() => {
    if (hiddenQuestionObjects !== undefined) {
      setLastKnownHiddenQuestions(hiddenQuestionObjects);
    }
  }, [hiddenQuestionObjects]);

  const questionsToDisplay = (
    hiddenQuestionObjects ?? lastKnownHiddenQuestions
  )?.filter((q) => hiddenQuestions.includes(q._id));

  useEffect(() => {
    if (hiddenQuestionObjects) {
      const serverIds = hiddenQuestionObjects.map((q) => q._id);
      if (serverIds.length !== hiddenQuestions.length) {
        setHiddenQuestions(serverIds);
      }
    }
  }, [hiddenQuestionObjects, hiddenQuestions, setHiddenQuestions]);

  const visibleStyleCount = allStyles?.filter(
    (s) => !hiddenStyles?.includes(s._id),
  ).length;
  const hiddenStyleCount = allStyles?.filter((s) =>
    hiddenStyles?.includes(s._id),
  ).length;

  const visibleToneCount = allTones?.filter(
    (t) => !hiddenTones?.includes(t._id),
  ).length;
  const hiddenToneCount = allTones?.filter((t) =>
    hiddenTones?.includes(t._id),
  ).length;

  const legalLinks = [
    { to: "/about", label: "About Us" },
    { to: "/contact", label: "Contact Us" },
    { to: "/privacy", label: "Privacy Policy" },
    { to: "/terms", label: "Terms of Service" },
    { to: "/cookies", label: "Cookie Policy" },
    { to: "/data-retention", label: "Data Retention Policy" },
  ];

  return (
    <div className="deck-canvas min-h-screen overflow-x-clip text-foreground">
      <Header />

      <main className="mx-auto max-w-4xl px-4 pb-16 pt-[calc(var(--header-h,4rem)+1.75rem)] sm:px-6">
        <h1 className="mb-6 text-2xl font-extrabold tracking-[-0.03em] text-foreground sm:text-3xl">
          Settings
        </h1>

        <div className="space-y-5">
          {isSignedIn && currentUser && (
            <>
              <CollapsibleSection
                title="AI Usage"
                isOpen={!!openSections["subscription"]}
                onOpenChange={() => toggleSection("subscription")}
              >
                <div className="space-y-5">
                  <div className="rounded-2xl border border-border bg-muted/40 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Usage this cycle
                    </p>
                    <p className="mt-1 text-2xl font-extrabold tracking-[-0.02em] text-foreground">
                      {currentUser.aiUsage?.count ?? 0} / {currentUser.aiLimit}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        AI Generations Progress
                      </span>
                      <span className="font-semibold text-foreground">
                        {Math.round(
                          ((currentUser.aiUsage?.count ?? 0) /
                            Math.max(1, Number(currentUser.aiLimit))) *
                            100,
                        )}
                        %
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            ((currentUser.aiUsage?.count ?? 0) /
                              Math.max(1, Number(currentUser.aiLimit))) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title="Newsletter Preferences"
                isOpen={!!openSections["newsletter"]}
                onOpenChange={() => toggleSection("newsletter")}
              >
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-muted/40 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Daily Questions
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-foreground">
                      Get personalized icebreakers every morning
                    </p>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    className="min-h-10 rounded-full border-border bg-card px-4 font-semibold"
                  >
                    <Link to="/unsubscribe">Manage / Unsubscribe</Link>
                  </Button>
                </div>
              </CollapsibleSection>
            </>
          )}

          {!isSignedIn && (
            <CollapsibleSection
              title="When your saved lists are full"
              isOpen={!!openSections["storage-limit"]}
              onOpenChange={() => toggleSection("storage-limit")}
            >
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Choose what happens when you reach the guest limit for liked or
                  hidden questions. History always drops its oldest entry to make
                  room.
                </p>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-muted/30 p-3.5 transition-colors hover:bg-accent/50">
                  <input
                    type="radio"
                    name="storageLimitBehavior"
                    value="block"
                    checked={storageLimitBehavior === "block"}
                    onChange={() => setStorageLimitBehavior("block")}
                    className="mt-0.5 h-5 w-5 accent-primary"
                  />
                  <div>
                    <span className="block text-sm font-semibold text-foreground">
                      Block when full
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Prevent adding new items until you remove some.
                    </span>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-muted/30 p-3.5 transition-colors hover:bg-accent/50">
                  <input
                    type="radio"
                    name="storageLimitBehavior"
                    value="replace"
                    checked={storageLimitBehavior === "replace"}
                    onChange={() => setStorageLimitBehavior("replace")}
                    className="mt-0.5 h-5 w-5 accent-primary"
                  />
                  <div>
                    <span className="block text-sm font-semibold text-foreground">
                      Auto-replace old items
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Automatically remove the oldest item to make space.
                    </span>
                  </div>
                </label>
              </div>
            </CollapsibleSection>
          )}

          <CollapsibleSection
            title="Manage Styles"
            isOpen={!!openSections["manage-styles"]}
            onOpenChange={() => toggleSection("manage-styles")}
            visibleCount={visibleStyleCount}
            hiddenCount={hiddenStyleCount}
          >
            {!isSignedIn ? (
              <div className="space-y-4">
                {allGuestStyles.filter((item) => hiddenStyles?.includes(item._id))
                  .length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-foreground">
                      Styles you've hidden
                    </p>
                    <ul className="space-y-2">
                      {allGuestStyles
                        .filter((item) => hiddenStyles?.includes(item._id))
                        .map((item) => (
                          <li
                            key={item._id}
                            className="flex items-center justify-between rounded-2xl border border-border bg-muted/30 px-3.5 py-2.5"
                          >
                            <span className="flex items-center gap-2.5 text-sm font-medium text-foreground">
                              <DynamicIcon
                                name={item.icon}
                                color={item.color}
                                size={20}
                              />
                              {item.name}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeHiddenStyle(item._id)}
                              className="min-h-10 rounded-full px-4 font-semibold"
                            >
                              Unhide
                            </Button>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  You can hide a style from any question card.{" "}
                  <SignInButton mode="modal">
                    <button
                      type="button"
                      className="font-semibold text-primary underline underline-offset-4"
                    >
                      Sign in
                    </button>
                  </SignInButton>{" "}
                  to choose from the full list here.
                </p>
              </div>
            ) : typeof allStyles === "undefined" ? (
              <div className="flex items-center justify-center p-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
              </div>
            ) : allStyles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No styles available to manage.
              </p>
            ) : (
              <>
                <div className="mb-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setHiddenStyles([])}
                    className="min-h-10 rounded-full px-4 font-semibold"
                  >
                    Include All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const previous = hiddenStyles ?? [];
                      setHiddenStyles(allStyles.map((s) => s._id));
                      toast.success("All styles hidden", {
                        action: {
                          label: "Undo",
                          onClick: () => setHiddenStyles(previous),
                        },
                      });
                    }}
                    className="min-h-10 rounded-full px-4 font-semibold"
                  >
                    Hide All
                  </Button>
                </div>
                <ul className="space-y-2">
                  {allStyles.map((style) => {
                    const isIncluded = !hiddenStyles?.includes(style._id);
                    return (
                      <li
                        key={style._id}
                        className="flex items-center justify-between rounded-2xl border border-border bg-muted/30 px-3.5 py-2.5"
                      >
                        <div className="flex items-center gap-2.5">
                          <DynamicIcon
                            name={style.icon}
                            color={style.color}
                            size={20}
                          />
                          <span className="text-sm font-medium text-foreground">
                            {style.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleShowInfo(style, "Style")}
                            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Show info about ${style.name}`}
                          >
                            <DynamicIcon name="info" size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStyle(style._id)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              isIncluded ? "bg-emerald-600" : "bg-input"
                            }`}
                            role="switch"
                            aria-checked={isIncluded}
                            aria-label={`Show ${style.name} questions`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                                isIncluded ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Manage Tones"
            isOpen={!!openSections["manage-tones"]}
            onOpenChange={() => toggleSection("manage-tones")}
            visibleCount={visibleToneCount}
            hiddenCount={hiddenToneCount}
          >
            {!isSignedIn ? (
              <div className="space-y-4">
                {allGuestTones.filter((item) => hiddenTones?.includes(item._id))
                  .length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-foreground">
                      Tones you've hidden
                    </p>
                    <ul className="space-y-2">
                      {allGuestTones
                        .filter((item) => hiddenTones?.includes(item._id))
                        .map((item) => (
                          <li
                            key={item._id}
                            className="flex items-center justify-between rounded-2xl border border-border bg-muted/30 px-3.5 py-2.5"
                          >
                            <span className="flex items-center gap-2.5 text-sm font-medium text-foreground">
                              <DynamicIcon
                                name={item.icon}
                                color={item.color}
                                size={20}
                              />
                              {item.name}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeHiddenTone(item._id)}
                              className="min-h-10 rounded-full px-4 font-semibold"
                            >
                              Unhide
                            </Button>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  You can hide a tone from any question card.{" "}
                  <SignInButton mode="modal">
                    <button
                      type="button"
                      className="font-semibold text-primary underline underline-offset-4"
                    >
                      Sign in
                    </button>
                  </SignInButton>{" "}
                  to choose from the full list here.
                </p>
              </div>
            ) : typeof allTones === "undefined" ? (
              <div className="flex items-center justify-center p-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
              </div>
            ) : allTones.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No tones available to manage.
              </p>
            ) : (
              <>
                <div className="mb-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setHiddenTones([])}
                    className="min-h-10 rounded-full px-4 font-semibold"
                  >
                    Include All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const previous = hiddenTones ?? [];
                      setHiddenTones(allTones.map((t) => t._id));
                      toast.success("All tones hidden", {
                        action: {
                          label: "Undo",
                          onClick: () => setHiddenTones(previous),
                        },
                      });
                    }}
                    className="min-h-10 rounded-full px-4 font-semibold"
                  >
                    Hide All
                  </Button>
                </div>
                <ul className="space-y-2">
                  {allTones.map((tone) => {
                    const isIncluded = !hiddenTones?.includes(tone._id);
                    return (
                      <li
                        key={tone._id}
                        className="flex items-center justify-between rounded-2xl border border-border bg-muted/30 px-3.5 py-2.5"
                      >
                        <div className="flex items-center gap-2.5">
                          <DynamicIcon
                            name={tone.icon}
                            color={tone.color}
                            size={20}
                          />
                          <span className="text-sm font-medium text-foreground">
                            {tone.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleShowInfo(tone, "Tone")}
                            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Show info about ${tone.name}`}
                          >
                            <DynamicIcon name="info" size={18} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleTone(tone._id)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              isIncluded ? "bg-emerald-600" : "bg-input"
                            }`}
                            role="switch"
                            aria-checked={isIncluded}
                            aria-label={`Show ${tone.name} questions`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                                isIncluded ? "translate-x-6" : "translate-x-1"
                              }`}
                            />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </CollapsibleSection>

          {!isSignedIn && hiddenQuestions.length >= MAX_ANON_BLOCKED && (
            <SignInCTA
              title="Hidden Question Limit Reached"
              featureHighlight={{
                pre: "Sign in to hide",
                highlight: "unlimited",
                post: "questions.",
              }}
            />
          )}

          <CollapsibleSection
            title="Hidden Questions"
            isOpen={!!openSections["hidden-questions"]}
            onOpenChange={() => toggleSection("hidden-questions")}
            count={
              isSignedIn
                ? questionsToDisplay?.length
                : `${hiddenQuestions.length}/${MAX_ANON_BLOCKED}`
            }
          >
            {questionsToDisplay && questionsToDisplay.length > 0 ? (
              <>
                <div className="mb-4 flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmUnhideAllOpen(true)}
                    className="min-h-10 rounded-full px-4 font-semibold"
                  >
                    Unhide all
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {questionsToDisplay.map((question) => {
                    const style = stylesMap.get(
                      question.styleId || (question.style as string) || "",
                    );
                    const tone = tonesMap.get(
                      question.toneId || (question.tone as string) || "",
                    );
                    const cardGradient = [
                      style?.color || "#0E7490",
                      tone?.color || "#6366F1",
                    ];

                    return (
                      <div key={question._id}>
                        <ModernQuestionCard
                          question={question}
                          isGenerating={false}
                          isFavorite={false}
                          isHidden={true}
                          gradient={cardGradient}
                          style={style}
                          tone={tone}
                          onToggleFavorite={() => {
                            unhideQuestion(question._id);
                            addLikedQuestion(question._id);
                            toast.success("Unhidden and added to Liked");
                          }}
                          onToggleHidden={() => unhideQuestion(question._id)}
                          onHideStyle={(styleId) => {
                            if (!hiddenStyles?.includes(styleId))
                              addHiddenStyle(styleId);
                          }}
                          onHideTone={(toneId) => {
                            if (!hiddenTones?.includes(toneId))
                              addHiddenTone(toneId);
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            ) : hiddenQuestions.length > 0 && questionsToDisplay === undefined ? (
              <p role="status" className="text-sm text-muted-foreground">
                Loading your hidden questions…
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                You have no hidden questions.
              </p>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Legal & Support"
            isOpen={!!openSections["legal"]}
            onOpenChange={() => toggleSection("legal")}
          >
            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {legalLinks.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex min-h-12 items-center justify-between bg-muted/20 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/60"
                >
                  <span>{item.label}</span>
                  <ChevronRight
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      </main>

      <ItemDetailDrawer
        item={selectedItem}
        isOpen={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
      />

      <ConfirmDialog
        open={confirmUnhideAllOpen}
        onOpenChange={setConfirmUnhideAllOpen}
        title="Unhide all hidden questions?"
        description="Every question you previously hid will start appearing in your feed again."
        confirmLabel="Unhide all"
        destructive={false}
        onConfirm={() => {
          clearHiddenQuestions();
          toast.success("All hidden questions are showing again");
        }}
      />
    </div>
  );
};

export default SettingsPage;
