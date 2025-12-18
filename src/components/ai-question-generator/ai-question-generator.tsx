import { useState, useEffect } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Doc } from "../../../convex/_generated/dataModel";

interface AIQuestionGeneratorProps {
  onQuestionGenerated: (question?: Doc<"questions">) => void;
  onClose: () => void;
}

type GeneratedQuestion = {
  text: string;
  tags: string[];
};

export const AIQuestionGenerator = ({ onQuestionGenerated, onClose }: AIQuestionGeneratorProps) => {

  const styles = useQuery(api.styles.getStyles, {});
  const tones = useQuery(api.tones.getTones, {});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState<string>("");
  const [selectedStyle, setSelectedStyle] = useState<string>(styles?.[0]?.id || "random");
  const [selectedTone, setSelectedTone] = useState<string>(tones?.[0]?.id || "random");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedTagGroupings, setExpandedTagGroupings] = useState<Set<string>>(new Set());
  const [previewQuestion, setPreviewQuestion] = useState<Doc<"questions"> | null>(null);

  const tags = useQuery(api.tags.getTags);
  const generateAIQuestion = useAction(api.ai.generateAIQuestions);
  const saveAIQuestion = useMutation(api.questions.saveAIQuestion);
  const initializeTags = useMutation(api.tags.initializeTags);

  useEffect(() => {
    if (styles && styles.length > 0 && (selectedStyle === "random" || !styles.find(s => s.id === selectedStyle))) {
      setSelectedStyle(styles[0].id);
    }
  }, [styles, selectedStyle]);

  useEffect(() => {
    if (tones && tones.length > 0 && (selectedTone === "random" || !tones.find(t => t.id === selectedTone))) {
      setSelectedTone(tones[0].id);
    }
  }, [tones, selectedTone]);

  const handleTagToggle = (tagName: string) => {
    setSelectedTags(prev =>
      prev.includes(tagName)
        ? prev.filter(tag => tag !== tagName)
        : [...prev, tagName]
    );
  };

  const handleAddCustomTag = () => {
    const newTag = customTag.trim();
    if (newTag && !selectedTags.includes(newTag)) {
      setSelectedTags(prev => [...prev, newTag]);
      setCustomTag("");
    } else if (selectedTags.includes(newTag)) {
      toast.info("Tag already selected");
    }
  };

  const toggleTagGrouping = (grouping: string) => {
    setExpandedTagGroupings(prev => {
      const newSet = new Set(prev);
      if (newSet.has(grouping)) {
        newSet.delete(grouping);
      } else {
        newSet.add(grouping);
      }
      return newSet;
    });
  };

  const expandAllTagGroupings = () => {
    if (tags) {
      const groupings = Array.from(new Set(tags.map(tag => tag.grouping)));
      setExpandedTagGroupings(new Set(groupings));
    }
  };

  const collapseAllTagGroupings = () => {
    setExpandedTagGroupings(new Set());
  };

  const handleGenerateQuestion = async () => {
    if (selectedTags.length === 0) {
      toast.error("Please select at least one tag");
      return;
    }

    setIsGenerating(true);
    try {
      const generatedQuestion = await generateAIQuestion({
        selectedTags,
        currentQuestion: previewQuestion ? previewQuestion.text : undefined,
        style: selectedStyle,
        tone: selectedTone,
        count: 1,
      });
      setPreviewQuestion(generatedQuestion[0] as Doc<"questions">);
      toast.success("Preview generated. Review and accept or try another.");
    } catch (error) {
      console.error("Error generating question:", error);
      if (error instanceof Error && error.message.includes("limit reached")) {
        toast.error(
          <div className="flex flex-col gap-2">
            <span>AI generation limit reached for this month.</span>
            <button
              onClick={() => window.location.href = "/settings"}
              className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 w-fit"
            >
              Upgrade Plan
            </button>
          </div>
        );
      } else {
        toast.error("Failed to generate AI question. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAcceptQuestion = async () => {
    if (!previewQuestion) return;
    if (!previewQuestion.text) return;
    setIsSaving(true);
    try {
      // Determine grouping based on selected tags

      const newQuestion = await saveAIQuestion({
        text: previewQuestion.text,
        tags: previewQuestion.tags || [],
        style: selectedStyle,
        tone: selectedTone,
      });
      toast.success("AI question saved!");
      if (newQuestion) {
        onQuestionGenerated(newQuestion);
      }
      onClose();
    } catch (error) {
      console.error("Error saving AI question:", error);
      toast.error("Failed to save AI question. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const tagGroupings = tags ? Array.from(new Set(tags.map(tag => tag.grouping))) : [];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 50 }}
        animate={{ y: 0 }}
        exit={{ y: 50 }}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Generate AI Question
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
              Select a question style:
            </h3>
            <div className="flex flex-wrap gap-2">
              {styles?.map(style => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${selectedStyle === style.id
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                >
                  {style.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
              Select a question tone:
            </h3>
            <div className="flex flex-wrap gap-2">
              {tones?.map(tone => (
                <button
                  key={tone.id}
                  onClick={() => setSelectedTone(tone.id)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${selectedTone === tone.id
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                >
                  {tone.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
              Select topics for your question:
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Choose one or more categories to help guide the AI in generating a relevant question.
            </p>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustomTag();
                  }
                }}
                placeholder="Add a custom tag"
                className="flex-grow px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <button
                onClick={handleAddCustomTag}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Sticky Expand/Collapse All Buttons */}
          <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 py-3 border-b border-gray-200 dark:border-gray-700 mb-4">
            <div className="flex gap-2">
              <button
                onClick={expandAllTagGroupings}
                className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Expand All
              </button>
              <button
                onClick={collapseAllTagGroupings}
                className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Collapse All
              </button>
            </div>
          </div>

          {tags && (
            <div className="space-y-2 pb-32">
              {tagGroupings.map(grouping => {
                const isExpanded = expandedTagGroupings.has(grouping);
                const groupingTags = tags.filter(tag => tag.grouping === grouping);
                const selectedCount = groupingTags.filter(tag => selectedTags.includes(tag.name)).length;

                return (
                  <div key={grouping} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleTagGrouping(grouping)}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <svg
                          className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""
                            }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                        <h4 className="font-medium text-gray-900 dark:text-white capitalize">
                          {grouping}
                        </h4>
                        {selectedCount > 0 && (
                          <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                            {selectedCount} selected
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {groupingTags.length} tags
                      </span>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 bg-white dark:bg-gray-800">
                            <div className="flex flex-wrap gap-2">
                              {groupingTags.map(tag => (
                                <button
                                  key={tag._id}
                                  onClick={() => handleTagToggle(tag.name)}
                                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${selectedTags.includes(tag.name)
                                    ? "bg-blue-500 text-white"
                                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                                    }`}
                                >
                                  {tag.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sticky Bottom Section */}
          <div className="sticky bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-6 z-10">
            <div className="max-w-2xl mx-auto">
              {previewQuestion && (
                <div className="mb-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                  <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Preview</div>
                  <div className="text-gray-900 dark:text-gray-100 text-base mb-3">{previewQuestion.text}</div>
                  {previewQuestion.tags?.length && previewQuestion.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {previewQuestion.tags?.map((t) => (
                        <span key={t} className="px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {selectedTags.length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Selected: {selectedTags.join(", ")}
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                {previewQuestion ? (
                  <>
                    <button
                      onClick={() => void handleAcceptQuestion()}
                      disabled={isSaving}
                      className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                      {isSaving ? (
                        <span className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Saving...
                        </span>
                      ) : (
                        "Accept"
                      )}
                    </button>
                    <button
                      onClick={() => void handleGenerateQuestion()}
                      disabled={isGenerating || selectedTags.length === 0}
                      className="px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                      {isGenerating ? (
                        <span className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700 dark:border-gray-200 mr-2"></div>
                          Generating...
                        </span>
                      ) : (
                        "Generate Another"
                      )}
                    </button>
                    <button
                      onClick={onClose}
                      className="px-4 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => void handleGenerateQuestion()}
                      disabled={isGenerating || selectedTags.length === 0}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                      {isGenerating ? (
                        <span className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Generating...
                        </span>
                      ) : (
                        "Generate Question"
                      )}
                    </button>
                    <button
                      onClick={onClose}
                      className="px-4 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
