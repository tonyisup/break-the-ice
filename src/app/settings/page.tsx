"use client";

import { useEffect, useMemo } from "react";
import { useStorageContext } from "../../hooks/useStorageContext";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTheme } from "../../hooks/useTheme";
import { CollapsibleSection } from "../../components/collapsible-section/CollapsibleSection";
import { Header } from "@/components/header";
import { Id } from "../../../convex/_generated/dataModel";
import { useState } from "react";
import DynamicIcon from "@/components/ui/dynamic-icon";
import { ItemDetailDrawer, ItemDetails } from "@/components/item-detail-drawer/item-detail-drawer";
import { Doc } from "../../../convex/_generated/dataModel";

const SettingsPage = () => {
  const { effectiveTheme } = useTheme();
  const allStyles = useQuery(api.styles.getStyles);
  const allTones = useQuery(api.tones.getTones);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemDetails | null>(null);

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleShowInfo = (item: Doc<"styles"> | Doc<"tones">, type: "Style" | "Tone") => {
    setSelectedItem({
      id: item._id,
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
    bypassLandingPage,
    setBypassLandingPage,
  } = useStorageContext();

  const handleToggleStyle = (styleId: string) => {
    if (hiddenStyles.includes(styleId)) {
      removeHiddenStyle(styleId);
    } else {
      addHiddenStyle(styleId);
    }
  };

  const handleToggleTone = (toneId: string) => {
    if (hiddenTones.includes(toneId)) {
      removeHiddenTone(toneId);
    } else {
      addHiddenTone(toneId);
    }
  };

  const unhideQuestion = (questionId: Id<"questions">) => {
    removeHiddenQuestion(questionId);
  };
  const hiddenQuestionObjects = useQuery(api.questions.getQuestionsByIds, { ids: hiddenQuestions });

  const handleHideItem = (item: ItemDetails) => {
    if (item.type === "Style") {
      handleToggleStyle(item.id);
    } else {
      handleToggleTone(item.id);
    }
  };


  useEffect(() => {
    if (allStyles) {
      const serverIds = allStyles.map(s => s.id);
      const localIds = hiddenStyles;
      const filteredIds = localIds.filter(id => serverIds.includes(id));
      if (filteredIds.length !== localIds.length) {
            setHiddenStyles(filteredIds);
      }
    }
  }, [allStyles, hiddenStyles, setHiddenStyles]);

  useEffect(() => {
    if (allTones) {
      const serverIds = allTones.map(t => t.id);
      const localIds = hiddenTones;
      const filteredIds = localIds.filter(id => serverIds.includes(id));
      if (filteredIds.length !== localIds.length) {
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

  const gradientLight = ["#667EEA", "#A064DE"];
  const gradientDark = ["#3B2554", "#262D54"];
  return (
    <div
      className="min-h-screen transition-colors overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${effectiveTheme === "dark" ? gradientDark[0] : gradientLight[0]}, ${effectiveTheme === "dark" ? gradientDark[1] : gradientLight[1]}, ${effectiveTheme === "dark" ? "#000" : "#fff"})`
      }}
    >
      <Header 
        gradient={effectiveTheme === "dark" ? gradientDark : gradientLight}
        homeLinkSlot="settings" />

      <div className="container mx-auto p-4 md:p-8">
        <h1 className="text-3xl font-bold mb-6 dark:text-white text-black">Settings</h1>

        <div className="space-y-8">
          <CollapsibleSection
            title="General"
            isOpen={!!openSections['general']}
            onOpenChange={() => toggleSection('general')}
            count={undefined}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="dark:text-white text-black font-semibold">Bypass Landing Page</p>
                <p className="text-sm dark:text-white/70 text-black/70">Go directly to the app when visiting the site.</p>
              </div>
              <button
                onClick={() => setBypassLandingPage(!bypassLandingPage)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${bypassLandingPage ? 'bg-green-500' : 'bg-white/20 dark:bg-black/20'}`}
                aria-pressed={bypassLandingPage}
                aria-label="Toggle bypass landing page"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${bypassLandingPage ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>
          </CollapsibleSection>
          <CollapsibleSection
            title="Manage Styles"
            isOpen={!!openSections['manage-styles']}
            onOpenChange={() => toggleSection('manage-styles')}
            count={allStyles?.length}
          >
            {allStyles && allStyles.length > 0 ? (
              <>
                <div className="flex space-x-2 mb-4">
                  <button
                    onClick={() => setHiddenStyles([])}
                    className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-black/20 dark:text-white text-black rounded-md hover:bg-white/30 transition-colors"
                  >
                    Include All
                  </button>
                  <button
                    onClick={() => setHiddenStyles(allStyles.map(s => s.id))}
                    className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-black/20 dark:text-white text-black rounded-md hover:bg-white/30 transition-colors"
                  >
                    Hide All
                  </button>
                </div>
                <ul className="space-y-2">
                  {allStyles.map(style => {
                    const isIncluded = !hiddenStyles.includes(style.id);
                    return (
                      <li key={style.id} className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm rounded-lg">
                        <div className="flex items-center">
                          <DynamicIcon name={style.icon} color={style.color} size={24} className="mr-2" />
                          <span className="dark:text-white text-black">{style.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleShowInfo(style, "Style")} className="p-1">
                            <DynamicIcon name="info" size={18} />
                          </button>
                          <button
                            onClick={() => handleToggleStyle(style.id)}
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
            ) : (
              <p className="dark:text-white/70 text-black/70">No styles available to manage.</p>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Manage Tones"
            isOpen={!!openSections['manage-tones']}
            onOpenChange={() => toggleSection('manage-tones')}
            count={allTones?.length}
          >
            {allTones && allTones.length > 0 ? (
              <>
                <div className="flex space-x-2 mb-4">
                  <button
                    onClick={() => setHiddenTones([])}
                    className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-black/20 dark:text-white text-black rounded-md hover:bg-white/30 transition-colors"
                  >
                    Include All
                  </button>
                  <button
                    onClick={() => setHiddenTones(allTones.map(t => t.id))}
                    className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-black/20 dark:text-white text-black rounded-md hover:bg-white/30 transition-colors"
                  >
                    Hide All
                  </button>
                </div>
                <ul className="space-y-2">
                  {allTones.map(tone => {
                    const isIncluded = !hiddenTones.includes(tone.id);
                    return (
                      <li key={tone.id} className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm rounded-lg">
                        <div className="flex items-center">
                          <DynamicIcon name={tone.icon} color={tone.color} size={24} className="mr-2" />
                          <span className="dark:text-white text-black">{tone.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleShowInfo(tone, "Tone")} className="p-1">
                            <DynamicIcon name="info" size={18} />
                          </button>
                          <button
                            onClick={() => handleToggleTone(tone.id)}
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
            ) : (
              <p className="dark:text-white/70 text-black/70">No tones available to manage.</p>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Hidden Questions"
            isOpen={!!openSections['hidden-questions']}
            onOpenChange={() => toggleSection('hidden-questions')}
            count={hiddenQuestionObjects?.length}
          >
            {hiddenQuestionObjects && hiddenQuestionObjects.length > 0 ? (
              <>
                <button
                  onClick={clearHiddenQuestions}
                  className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-black/20 dark:text-white text-black rounded-md hover:bg-white/30 transition-colors mb-4"
                >
                  Clear All
                </button>
                <ul className="space-y-2">
                  {hiddenQuestionObjects.map(question => (
                    question && <li key={question._id} className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm rounded-lg">
                      <span className="dark:text-white text-black">{question.text}</span>
                      <button
                        onClick={() => unhideQuestion(question._id)}
                        className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-black/20 dark:text-white text-black rounded-md hover:bg-white/30 transition-colors"
                      >
                        Unhide
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="dark:text-white/70 text-black/70">You have no hidden questions.</p>
            )}
          </CollapsibleSection>
        </div>
      </div>
      <ItemDetailDrawer
        item={selectedItem}
        isOpen={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
      />
    </div>
  );
};

export default SettingsPage;
