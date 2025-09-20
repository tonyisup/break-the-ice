"use client";

import { useEffect } from "react";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTheme } from "../../hooks/useTheme";
import { Link } from "react-router-dom";
import { HouseIcon } from '@/components/ui/icons';
import { CollapsibleSection } from "../../components/collapsible-section/CollapsibleSection";
import { Header } from "@/components/header";
import { Id } from "../../../convex/_generated/dataModel";
import { useState } from "react";

const SettingsPage = () => {
  const { theme } = useTheme();
  const allStyles = useQuery(api.styles.getStyles);
  const allTones = useQuery(api.tones.getTones);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };
  const [hiddenStyles, setHiddenStyles] = useLocalStorage<string[]>("hiddenStyles", []);
  const [hiddenTones, setHiddenTones] = useLocalStorage<string[]>("hiddenTones", []);
  const [bypassLandingPage, setBypassLandingPage] = useLocalStorage<boolean>("bypassLandingPage", false);
  
  const settings = useQuery(api.users.getSettings);
  const updateAutoAdvanceShuffle = useMutation(api.users.updateAutoAdvanceShuffle);
  const updateHiddenQuestions = useMutation(api.users.updateHiddenQuestions);

  const autoAdvanceShuffle = settings?.autoAdvanceShuffle ?? false;
  const hiddenQuestions = settings?.hiddenQuestions ?? [];

  const unhideStyle = (styleId: string) => {
    setHiddenStyles(prev => prev.filter(id => id !== styleId));
  };

  const unhideTone = (toneId: string) => {
    setHiddenTones(prev => prev.filter(id => id !== toneId));
  };

  const unhideQuestion = (questionId: Id<"questions">) => {
    const newHiddenQuestions = hiddenQuestions.filter(id => id !== questionId);
    updateHiddenQuestions({ hiddenQuestions: newHiddenQuestions });
  };

  const clearHiddenQuestions = () => {
    updateHiddenQuestions({ hiddenQuestions: [] });
  }

  const hiddenStyleObjects = allStyles?.filter(style => hiddenStyles.includes(style.id));
  const hiddenToneObjects = allTones?.filter(tone => hiddenTones.includes(tone.id));
  const hiddenQuestionObjects = useQuery(api.questions.getQuestionsByIds, { ids: hiddenQuestions as Id<"questions">[] });

  useEffect(() => {
    if (hiddenQuestionObjects) {
      const serverIds = hiddenQuestionObjects.map(q => q!._id);
      if (serverIds.length !== hiddenQuestions.length) {
        setHiddenQuestions(serverIds);
      }
    }
  }, [hiddenQuestionObjects, hiddenQuestions, setHiddenQuestions]);

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

  const gradientLight = ["#667EEA", "#A064DE"];
  const gradientDark = ["#3B2554", "#262D54"];
  return (
    <div
      className="min-h-screen transition-colors overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${theme === "dark" ? gradientDark[0] : gradientLight[0]}, ${theme === "dark" ? gradientDark[1] : gradientLight[1]}, ${theme === "dark" ? "#000" : "#fff"})`
      }}
    >
      <Header 
        gradient={theme === "dark" ? gradientDark : gradientLight} 
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
            title="Shuffle"
            isOpen={!!openSections['shuffle']}
            onOpenChange={() => toggleSection('shuffle')}
            count={undefined}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="dark:text-white text-black font-semibold">Auto-advance Shuffle</p>
                <p className="text-sm dark:text-white/70 text-black/70">Automatically confirm style and tone after shuffling.</p>
              </div>
              <button
                onClick={() => updateAutoAdvanceShuffle({ autoAdvanceShuffle: !autoAdvanceShuffle })}
                disabled={settings === undefined}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoAdvanceShuffle ? 'bg-green-500' : 'bg-white/20 dark:bg-black/20'}`}
                aria-pressed={autoAdvanceShuffle}
                aria-label="Toggle auto-advance shuffle"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoAdvanceShuffle ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>
          </CollapsibleSection>
          <CollapsibleSection
            title="Hidden Styles"
            isOpen={!!openSections['hidden-styles']}
            onOpenChange={() => toggleSection('hidden-styles')}
            count={hiddenStyleObjects?.length}
          >
            {hiddenStyleObjects && hiddenStyleObjects.length > 0 ? (
              <>
                <button
                  onClick={() => setHiddenStyles([])}
                  className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-black/20 dark:text-white text-black rounded-md hover:bg-white/30 transition-colors mb-4"
                >
                  Clear All
                </button>
                <ul className="space-y-2">
                  {hiddenStyleObjects.map(style => (
                    <li key={style.id} className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm rounded-lg">
                      <span className="dark:text-white text-black">{style.name}</span>
                      <button
                        onClick={() => unhideStyle(style.id)}
                        className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-black/20 dark:text-white text-black rounded-md hover:bg-white/30 transition-colors"
                      >
                        Unhide
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="dark:text-white/70 text-black/70">You have no hidden styles.</p>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Hidden Tones"
            isOpen={!!openSections['hidden-tones']}
            onOpenChange={() => toggleSection('hidden-tones')}
            count={hiddenToneObjects?.length}
          >
            {hiddenToneObjects && hiddenToneObjects.length > 0 ? (
              <>
                <button
                  onClick={() => setHiddenTones([])}
                  className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-black/20 dark:text-white text-black rounded-md hover:bg-white/30 transition-colors mb-4"
                >
                  Clear All
                </button>
                <ul className="space-y-2">
                  {hiddenToneObjects.map(tone => (
                    <li key={tone.id} className="flex items-center justify-between p-3 bg-white/10 backdrop-blur-sm rounded-lg">
                      <span className="dark:text-white text-black">{tone.name}</span>
                      <button
                        onClick={() => unhideTone(tone.id)}
                        className="px-3 py-1 text-sm font-semibold bg-white/20 dark:bg-black/20 dark:text-white text-black rounded-md hover:bg-white/30 transition-colors"
                      >
                        Unhide
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="dark:text-white/70 text-black/70">You have no hidden tones.</p>
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
    </div>
  );
};

export default SettingsPage;
