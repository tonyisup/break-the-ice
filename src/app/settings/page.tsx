"use client";

import { useEffect, useState, useMemo } from "react";
import { useStorageContext } from "../../hooks/useStorageContext";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTheme } from "../../hooks/useTheme";
import { CollapsibleSection } from "../../components/collapsible-section/CollapsibleSection";
import { Header } from "@/components/header";
import { Id } from "../../../convex/_generated/dataModel";
import DynamicIcon from "@/components/ui/dynamic-icon";
import { ItemDetailDrawer, ItemDetails } from "@/components/item-detail-drawer/item-detail-drawer";
import { Doc } from "../../../convex/_generated/dataModel";
import OrganizationSettings from "@/app/settings/organization/page";
import WorkspaceSwitcher from "@/app/settings/organization/WorkspaceSwitcher";
import CollectionsSettings from "@/app/settings/collections/page";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuth } from "@clerk/clerk-react";
import { SubscriptionDetailsButton } from "@clerk/clerk-react/experimental";
import { MAX_ANON_BLOCKED } from "../../hooks/useStorage";
import { SignInCTA } from "@/components/SignInCTA";
import { Link, useSearchParams } from "react-router-dom";
import { Link as LinkIcon, ExternalLink } from "lucide-react";
import { ModernQuestionCard } from "@/components/modern-question-card/modern-question-card";

const SettingsPage = () => {
  const { isSignedIn } = useAuth();
  useTheme();
  const { activeWorkspace } = useWorkspace();
  const entitlements = useQuery(api.core.billing.getEffectiveEntitlements, {
    organizationId: activeWorkspace ?? undefined,
  });
  const teamWorkspaceId = entitlements?.canUseTeamFeatures
    ? activeWorkspace ?? undefined
    : undefined;

  const allStyles = useQuery(
    api.core.styles.getStyles,
    isSignedIn ? { organizationId: teamWorkspaceId } : "skip"
  );
  const allTones = useQuery(
    api.core.tones.getTones,
    isSignedIn ? { organizationId: teamWorkspaceId } : "skip"
  );
  const currentUser = useQuery(api.core.users.getCurrentUser, {
    organizationId: activeWorkspace ?? undefined,
  });
  const [searchParams] = useSearchParams();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const expand = searchParams.get('expand');
    if (expand) {
      const sections = expand.split(',');
      const newOpenSections: Record<string, boolean> = {};
      sections.forEach(s => {
        newOpenSections[s.trim()] = true;
      });
      setOpenSections(prev => ({ ...prev, ...newOpenSections }));
    }
  }, [searchParams]);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemDetails | null>(null);

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleShowInfo = (item: Doc<"styles"> | Doc<"tones">, type: "Style" | "Tone") => {
    setSelectedItem({
      id: item._id,
      slug: item.id,
      name: item.name,
      type: type,
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

  // Build style/tone lookup maps for card rendering
  const stylesMap = useMemo(() => {
    const map = new Map<string, Doc<"styles">>();
    if (!allStyles) return map;
    allStyles.forEach(s => {
      map.set(s.id, s as unknown as Doc<"styles">);
      map.set(s._id, s as unknown as Doc<"styles">);
    });
    return map;
  }, [allStyles]);

  const tonesMap = useMemo(() => {
    const map = new Map<string, Doc<"tones">>();
    if (!allTones) return map;
    allTones.forEach(t => {
      map.set(t.id, t as unknown as Doc<"tones">);
      map.set(t._id, t as unknown as Doc<"tones">);
    });
    return map;
  }, [allTones]);
  const hiddenQuestionObjects = useQuery(api.core.questions.getQuestionsByIds, { ids: hiddenQuestions });

  // prevent flickering when unhiding questions
  const [lastKnownHiddenQuestions, setLastKnownHiddenQuestions] = useState<Doc<"questions">[] | undefined>(undefined);

  useEffect(() => {
    if (hiddenQuestionObjects !== undefined) {
      setLastKnownHiddenQuestions(hiddenQuestionObjects);
    }
  }, [hiddenQuestionObjects]);

  const questionsToDisplay = (hiddenQuestionObjects ?? lastKnownHiddenQuestions)?.filter((q) =>
    hiddenQuestions.includes(q._id)
  );

  // Sync with backend IDs (filtering out invalid ones)
  useEffect(() => {
    if (allStyles) {
      const serverIds = allStyles.map(s => s._id);
      const localIds = hiddenStyles;
      const filteredIds = localIds?.filter(id => serverIds.includes(id));
      if (filteredIds && localIds && filteredIds?.length !== localIds?.length) {
        setHiddenStyles(filteredIds);
      }
    }
  }, [allStyles, hiddenStyles, setHiddenStyles]);

  useEffect(() => {
    if (allTones) {
      const serverIds = allTones.map(t => t._id);
      const localIds = hiddenTones;
      const filteredIds = localIds?.filter(id => serverIds.includes(id));
      if (filteredIds && localIds && filteredIds?.length !== localIds?.length) {
        setHiddenTones(filteredIds);
      }
    }
  }, [allTones, hiddenTones, setHiddenTones]);

  useEffect(() => {
    if (hiddenQuestionObjects) {
      const serverIds = hiddenQuestionObjects.map(q => q._id);
      if (serverIds.length !== hiddenQuestions.length) {
        setHiddenQuestions(serverIds);
      }
    }
  }, [hiddenQuestionObjects, hiddenQuestions, setHiddenQuestions]);

  const visibleStyleCount = allStyles?.filter(s => !hiddenStyles?.includes(s._id)).length;
  const hiddenStyleCount = allStyles?.filter(s => hiddenStyles?.includes(s._id)).length;

  const visibleToneCount = allTones?.filter(t => !hiddenTones?.includes(t._id)).length;
  const hiddenToneCount = allTones?.filter(t => hiddenTones?.includes(t._id)).length;

  return (
    <div className="app-shell overflow-x-clip">
      <Header />

      <div className="container mx-auto p-4 md:p-8 md:pt-24 pt-20">

        <WorkspaceSwitcher />

        <div className="space-y-8">

          <OrganizationSettings />

          <CollectionsSettings />

          {isSignedIn && currentUser && (
            <>
              <CollapsibleSection
                title="Subscription & AI Usage"
                isOpen={!!openSections['subscription']}
                onOpenChange={() => toggleSection('subscription')}
              >
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-muted rounded-xl border border-border">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Plan</p>
                      <p className="text-xl font-bold capitalize text-foreground">
                        {currentUser.planTier || 'free'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Usage this cycle</p>
                      <p className="text-xl font-bold text-foreground">
                        {currentUser.aiUsage?.count ?? 0} / {currentUser.aiLimit}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">AI Generations Progress</span>
                      <span className="text-foreground font-medium">
                        {Math.round(((currentUser.aiUsage?.count ?? 0) / Math.max(1, Number(currentUser.aiLimit))) * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all duration-500"
                        style={{ width: `${Math.min(100, ((currentUser.aiUsage?.count ?? 0) / Math.max(1, Number(currentUser.aiLimit))) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-muted p-4">
                    <p className="text-sm text-muted-foreground">
                      {entitlements?.canUseTeamFeatures
                        ? "Team billing is active for this workspace. Use Clerk to manage payment methods, upgrades, or cancellation."
                        : "The Team plan adds shared collections, invitations, and a larger AI allowance."}
                    </p>
                  </div>

                  {entitlements?.canUseTeamFeatures ? (
                    <SubscriptionDetailsButton for="organization">
                      <button className="w-full rounded-lg bg-secondary px-4 py-3 font-semibold text-secondary-foreground hover:bg-secondary/80">
                        Manage Team Billing
                      </button>
                    </SubscriptionDetailsButton>
                  ) : (
                    <Link
                      to="/pricing?source=settings"
                      className="block w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground hover:bg-primary/90 text-center"
                    >
                      Start Team Plan
                    </Link>
                  )}
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title="Newsletter Preferences"
                isOpen={!!openSections['newsletter']}
                onOpenChange={() => toggleSection('newsletter')}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                    <div>
                      <p className="text-sm text-gray-400">Daily Questions</p>
                      <p className="text-md font-medium text-white">
                        Get personalized icebreakers every morning
                      </p>
                    </div>
                    <Link
                      to="/unsubscribe"
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-sm font-semibold transition-colors text-white border border-white/10"
                    >
                      Manage / Unsubscribe
                    </Link>
                  </div>
                </div>
              </CollapsibleSection>
            </>
          )}

          {!isSignedIn && (
            <CollapsibleSection
              title="Storage Limit Behavior"
              isOpen={!!openSections['storage-limit']}
              onOpenChange={() => toggleSection('storage-limit')}
            >
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <p className="text-sm dark:text-white/70 text-black/70 mb-2">
                    Choose what happens when you reach the limit of history, liked, or hidden items as a guest.
                  </p>
                  <label className="flex items-center space-x-3 cursor-pointer p-3 rounded-lg hover:bg-white/10 dark:hover:bg-white/5 transition-colors">
                    <input
                      type="radio"
                      name="storageLimitBehavior"
                      value="block"
                      checked={storageLimitBehavior === "block"}
                      onChange={() => setStorageLimitBehavior("block")}
                      className="form-radio h-5 w-5 text-blue-600 transition duration-150 ease-in-out"
                    />
                    <div>
                      <span className="block font-medium dark:text-white text-black">Block when full</span>
                      <span className="block text-sm dark:text-white/60 text-black/60">
                        Prevent adding new items until you remove some.
                      </span>
                    </div>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer p-3 rounded-lg hover:bg-white/10 dark:hover:bg-white/5 transition-colors">
                    <input
                      type="radio"
                      name="storageLimitBehavior"
                      value="replace"
                      checked={storageLimitBehavior === "replace"}
                      onChange={() => setStorageLimitBehavior("replace")}
                      className="form-radio h-5 w-5 text-blue-600 transition duration-150 ease-in-out"
                    />
                    <div>
                      <span className="block font-medium dark:text-white text-black">Auto-replace old items</span>
                      <span className="block text-sm dark:text-white/60 text-black/60">
                        Automatically remove the oldest item to make space.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </CollapsibleSection>
          )}

          <CollapsibleSection
            title="Manage Styles"
            isOpen={!!openSections['manage-styles']}
            onOpenChange={() => toggleSection('manage-styles')}
            visibleCount={visibleStyleCount}
            hiddenCount={hiddenStyleCount}
          >
            {!isSignedIn ? (
              <div className="p-4">
                <p className="dark:text-white/70 text-black/70 mb-4">Sign in to manage your style preferences.</p>
                <SignInCTA
                  title="Sign In to Customize Styles"
                  featureHighlight={{
                    pre: "Personalize your",
                    highlight: "style preferences",
                    post: "with an account."
                  }}
                />
              </div>
            ) : typeof allStyles === 'undefined' ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin size-6 border-2 border-gray-200 dark:border-white/20 border-t-gray-500 dark:border-t-white rounded-full" />
              </div>
            ) : allStyles.length === 0 ? (
              <p className="dark:text-white/70 text-black/70">No styles available to manage.</p>
            ) : (
              <>
                <div className="flex space-x-2 mb-4">
                  <button
                    onClick={() => setHiddenStyles([])}
                    className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-black/20 dark:text-white text-black rounded-md hover:bg-white/30 transition-colors"
                  >
                    Include All
                  </button>
                  <button
                    onClick={() => setHiddenStyles(allStyles.map(s => s._id))}
                    className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-black/20 dark:text-white text-black rounded-md hover:bg-white/30 transition-colors"
                  >
                    Hide All
                  </button>
                </div>
                <ul className="space-y-2">
                  {allStyles.map(style => {
                    const isIncluded = !hiddenStyles?.includes(style._id);
                    return (
                      <li key={style._id} className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm rounded-lg">
                        <div className="flex items-center">
                          <DynamicIcon name={style.icon} color={style.color} size={24} className="mr-2" />
                          <span className="dark:text-white text-black">{style.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleShowInfo(style, "Style")} className="p-1" aria-label={`Show info about ${style.name}`}>
                            <DynamicIcon name="info" size={18} />
                          </button>
                          <button
                            onClick={() => handleToggleStyle(style._id)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isIncluded ? 'bg-green-500' : 'bg-white/20 dark:bg-black/20'}`}
                            aria-pressed={isIncluded}
                            aria-label={`Toggle style ${style.name}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isIncluded ? 'translate-x-6' : 'translate-x-1'}`}
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
            isOpen={!!openSections['manage-tones']}
            onOpenChange={() => toggleSection('manage-tones')}
            visibleCount={visibleToneCount}
            hiddenCount={hiddenToneCount}
          >
            {!isSignedIn ? (
              <div className="p-4">
                <p className="dark:text-white/70 text-black/70 mb-4">Sign in to manage your tone preferences.</p>
                <SignInCTA
                  title="Sign In to Customize Tones"
                  featureHighlight={{
                    pre: "Personalize your",
                    highlight: "tone preferences",
                    post: "with an account."
                  }}
                />
              </div>
            ) : typeof allTones === 'undefined' ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin size-6 border-2 border-gray-200 dark:border-white/20 border-t-gray-500 dark:border-t-white rounded-full" />
              </div>
            ) : allTones.length === 0 ? (
              <p className="dark:text-white/70 text-black/70">No tones available to manage.</p>
            ) : (
              <>
                <div className="flex space-x-2 mb-4">
                  <button
                    onClick={() => setHiddenTones([])}
                    className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-black/20 dark:text-white text-black rounded-md hover:bg-white/30 transition-colors"
                  >
                    Include All
                  </button>
                  <button
                    onClick={() => setHiddenTones(allTones.map(t => t._id))}
                    className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-black/20 dark:text-white text-black rounded-md hover:bg-white/30 transition-colors"
                  >
                    Hide All
                  </button>
                </div>
                <ul className="space-y-2">
                  {allTones.map(tone => {
                    const isIncluded = !hiddenTones?.includes(tone._id);
                    return (
                      <li key={tone._id} className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm rounded-lg">
                        <div className="flex items-center">
                          <DynamicIcon name={tone.icon} color={tone.color} size={24} className="mr-2" />
                          <span className="dark:text-white text-black">{tone.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleShowInfo(tone, "Tone")} className="p-1" aria-label={`Show info about ${tone.name}`}>
                            <DynamicIcon name="info" size={18} />
                          </button>
                          <button
                            onClick={() => handleToggleTone(tone._id)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isIncluded ? 'bg-green-500' : 'bg-white/20 dark:bg-black/20'}`}
                            aria-pressed={isIncluded}
                            aria-label={`Toggle tone ${tone.name}`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isIncluded ? 'translate-x-6' : 'translate-x-1'}`}
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
            <div className="mb-6">
              <SignInCTA
                title="Hidden Question Limit Reached"
                featureHighlight={{
                  pre: "Sign in to hide",
                  highlight: "unlimited",
                  post: "questions."
                }}
              />
            </div>
          )}

          <CollapsibleSection
            title="Hidden Questions"
            isOpen={!!openSections['hidden-questions']}
            onOpenChange={() => toggleSection('hidden-questions')}
            count={isSignedIn ? questionsToDisplay?.length : `${hiddenQuestions.length}/${MAX_ANON_BLOCKED}`}
          >
            {questionsToDisplay && questionsToDisplay.length > 0 ? (
              <>
                <button
                  onClick={clearHiddenQuestions}
                  className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-black/20 dark:text-white text-black rounded-md hover:bg-white/30 transition-colors mb-4"
                >
                  Clear All
                </button>
                <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {questionsToDisplay.map(question => {
                    const style = stylesMap.get(question.styleId || (question.style as string) || "");
                    const tone = tonesMap.get(question.toneId || (question.tone as string) || "");

                    return (
                      <div key={question._id}>
                        <ModernQuestionCard
                          question={question}
                          isGenerating={false}
                          isFavorite={false}
                          isHidden={true}
                          style={style}
                          tone={tone}
                          onToggleFavorite={() => {}}
                          onToggleHidden={() => unhideQuestion(question._id)}
                          onHideStyle={(styleId) => handleToggleStyle(styleId)}
                          onHideTone={(toneId) => handleToggleTone(toneId)}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="dark:text-white/70 text-black/70">You have no hidden questions.</p>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Legal & Support"
            isOpen={!!openSections['legal']}
            onOpenChange={() => toggleSection('legal')}
          >
            <div className="flex flex-col gap-2">
              <Link to="/about" className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm rounded-lg hover:bg-white/20 transition-colors dark:text-white text-black">
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  About Us
                </div>
                <LinkIcon className="w-4 h-4 opacity-50" />
              </Link>
              <Link to="/contact" className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm rounded-lg hover:bg-white/20 transition-colors dark:text-white text-black">
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Contact Us
                </div>
                <LinkIcon className="w-4 h-4 opacity-50" />
              </Link>
              <Link to="/privacy" className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm rounded-lg hover:bg-white/20 transition-colors dark:text-white text-black">
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Privacy Policy
                </div>
                <LinkIcon className="w-4 h-4 opacity-50" />
              </Link>
              <Link to="/terms" className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm rounded-lg hover:bg-white/20 transition-colors dark:text-white text-black">
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Terms of Service
                </div>
                <LinkIcon className="w-4 h-4 opacity-50" />
              </Link>
              <Link to="/cookies" className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm rounded-lg hover:bg-white/20 transition-colors dark:text-white text-black">
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Cookie Policy
                </div>
                <LinkIcon className="w-4 h-4 opacity-50" />
              </Link>
              <Link to="/data-retention" className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm rounded-lg hover:bg-white/20 transition-colors dark:text-white text-black">
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Data Retention Policy
                </div>
                <LinkIcon className="w-4 h-4 opacity-50" />
              </Link>
            </div>
          </CollapsibleSection>
        </div>
      </div>
      <ItemDetailDrawer
        item={selectedItem}
        isOpen={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
      />
    </div >
  );
};

export default SettingsPage;
