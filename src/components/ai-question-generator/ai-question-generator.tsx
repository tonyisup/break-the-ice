import { useState, useEffect } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface Tag {
  _id: string;
  name: string;
  category: string;
  description?: string;
}

interface AIQuestionGeneratorProps {
  onQuestionGenerated: (questionId: string) => void;
  onClose: () => void;
}

export const AIQuestionGenerator = ({ onQuestionGenerated, onClose }: AIQuestionGeneratorProps) => {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  const tags = useQuery(api.tags.getTags);
  const generateAIQuestion = useAction(api.ai.generateAIQuestion);
  const saveAIQuestion = useMutation(api.questions.saveAIQuestion);
  const initializeTags = useMutation(api.tags.initializeTags);

  // Initialize tags if they don't exist
  useEffect(() => {
    if (tags && tags.length === 0) {
      initializeTags();
    }
  }, [tags, initializeTags]);

  // Expand all categories by default
  // useEffect(() => {
  //   if (tags && tags.length > 0) {
  //     const categories = Array.from(new Set(tags.map(tag => tag.category)));
  //     setExpandedCategories(new Set(categories));
  //   }
  // }, [tags]);

  const handleTagToggle = (tagName: string) => {
    setSelectedTags(prev => 
      prev.includes(tagName) 
        ? prev.filter(tag => tag !== tagName)
        : [...prev, tagName]
    );
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const expandAllCategories = () => {
    if (tags) {
      const categories = Array.from(new Set(tags.map(tag => tag.category)));
      setExpandedCategories(new Set(categories));
    }
  };

  const collapseAllCategories = () => {
    setExpandedCategories(new Set());
  };

  const handleGenerateQuestion = async () => {
    if (selectedTags.length === 0) {
      toast.error("Please select at least one tag");
      return;
    }

    setIsGenerating(true);
    try {
      const generatedQuestion = await generateAIQuestion({ selectedTags });
      const questionId = await saveAIQuestion({
        text: generatedQuestion.text,
        tags: generatedQuestion.tags,
        promptUsed: generatedQuestion.promptUsed,
      });
      
      toast.success("AI question generated successfully!");
      onQuestionGenerated(questionId);
      onClose();
    } catch (error) {
      console.error("Error generating question:", error);
      toast.error("Failed to generate AI question. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const categories = tags ? Array.from(new Set(tags.map(tag => tag.category))) : [];

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
              Select topics for your question:
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Choose one or more categories to help guide the AI in generating a relevant question.
            </p>
          </div>

          {/* Sticky Expand/Collapse All Buttons */}
          <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 py-3 border-b border-gray-200 dark:border-gray-700 mb-4">
            <div className="flex gap-2">
              <button
                onClick={expandAllCategories}
                className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Expand All
              </button>
              <button
                onClick={collapseAllCategories}
                className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Collapse All
              </button>
            </div>
          </div>

          {tags && (
            <div className="space-y-2 pb-32">
              {categories.map(category => {
                const isExpanded = expandedCategories.has(category);
                const categoryTags = tags.filter(tag => tag.category === category);
                const selectedCount = categoryTags.filter(tag => selectedTags.includes(tag.name)).length;
                
                return (
                  <div key={category} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <svg
                          className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${
                            isExpanded ? "rotate-90" : ""
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
                          {category}
                        </h4>
                        {selectedCount > 0 && (
                          <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                            {selectedCount} selected
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {categoryTags.length} tags
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
                              {categoryTags.map(tag => (
                                <button
                                  key={tag._id}
                                  onClick={() => handleTagToggle(tag.name)}
                                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                                    selectedTags.includes(tag.name)
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
              {selectedTags.length > 0 && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Selected: {selectedTags.join(", ")}
                  </p>
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={handleGenerateQuestion}
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
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
