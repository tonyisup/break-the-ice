"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import OpenAI from "openai";
import { api, internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPEN_ROUTER_API_KEY,
  timeout: 30000, // 30 second timeout
  defaultHeaders: {
    'HTTP-Referer': 'https://breaktheiceberg.com', 
    'X-Title': 'Break the ice(berg)', 
  },
});

export const preview = action({
  args: {
    count: v.optional(v.number()),
    style: v.string(),
    tone: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.runQuery(api.questions.getSimilarQuestions, {
      count: args.count ?? 5,
      style: args.style,
      tone: args.tone,
    });
  },
});

// Generate an AI question based on selected tags
export const generateAIQuestion = action({
  args: {
    selectedTags: v.array(v.string()),
    currentQuestion: v.optional(v.string()),
    style: v.string(),
    tone: v.string(),
    model: v.optional(v.string()),
    count: v.optional(v.number()),
    _existingQuestionsForTesting: v.optional(v.array(v.string())),
  },
  returns: v.array(v.union(v.any(), v.null())),
  handler: async (ctx, args): Promise<(Doc<"questions"> | null)[]> => {
    const { selectedTags, currentQuestion, style: styleId, tone: toneId, model, count, _existingQuestionsForTesting } = args;
    const generationCount = count ?? 1;
    const newQuestions: (Doc<"questions"> | null)[] = [];

    try {

    const existingQuestionTexts =
      _existingQuestionsForTesting ??
      (
        await ctx.runQuery(api.questions.getSimilarQuestions, {
          count: 5,
          style: styleId,
          tone: toneId,
        })
      ).map((q: any) => q.text);

    // Build the prompt data structure once
    const promptData: {
      style:string;
      structure: string;
      styleGuidance?: string;
      tone: string;
      toneGuidance?: string;
      currentQuestion?: string;
      tags?: string;
      existingQuestions?: string[];
      count: number;
    } = {
      style: "",
      structure: "",
      tone: "",
      existingQuestions: existingQuestionTexts,
      count: generationCount,
    };

    if (styleId) {
      const style = await ctx.runQuery(api.styles.getStyle, { id: styleId });
      if (style) {
        promptData.style = style.name;
        promptData.structure = style.structure;
        promptData.styleGuidance = style.promptGuidanceForAI;
      }
    }
    if (toneId) {
      const tone = await ctx.runQuery(api.tones.getTone, { id: toneId });
      if (tone) {
        promptData.tone = tone.name;
        promptData.toneGuidance = tone.promptGuidanceForAI;
      }
    }
    if (currentQuestion) {
      promptData.currentQuestion = currentQuestion;
    }
    if (selectedTags.length > 0) {
      promptData.tags = selectedTags.join(", ");
    }

    // Retry logic for AI generation
    let attempts = 0;
    const maxAttempts = 3;
    let generatedContent = "";

    while (attempts < maxAttempts && !generatedContent) {
      try {
        attempts++;
        const completion = await openai.chat.completions.create({
          model: model ?? "@preset/break-the-ice-berg-default",
          messages: [
            {
              role: "system",
              content: `You are an ice-breaker generator that creates engaging ice-breaker questions for conversations. 

CRITICAL: You must ALWAYS respond with ONLY a valid JSON array of strings. Do not include any text before or after the JSON. Do not use markdown formatting. Do not include explanations or comments.

Example format: ["What's your favorite childhood memory?", "If you could have dinner with anyone, who would it be?"]

Requirements:
- Return exactly ${generationCount} question(s)
- Each question should be a string in the JSON array
- Avoid questions too similar to existing ones
- Make questions engaging and conversation-starting`
            },
            {
              role: "user",
              content: `Generate ${generationCount} ice-breaker question(s) with these parameters:
${JSON.stringify(promptData, null, 2)}

Respond with ONLY the JSON array, no other text.`
            }
          ],
          max_tokens: 500 * generationCount,
          temperature: 0.7,
        });

        generatedContent = completion.choices[0]?.message?.content?.trim() || "";
        
        if (!generatedContent) {
          console.log(`Attempt ${attempts}: No content generated`);
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
            continue;
          }
          throw new Error("Failed to generate question after multiple attempts");
        }

        // Validate that we have a reasonable response length
        if (generatedContent.length < 10) {
          console.log(`Attempt ${attempts}: Response too short (${generatedContent.length} chars):`, generatedContent);
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          throw new Error("AI response too short");
        }

        // If we get here, we have content, so break out of the retry loop
        break;
        
      } catch (error) {
        console.error(`Attempt ${attempts} failed:`, error);
        if (attempts >= maxAttempts) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
      }
    }

    if (!generatedContent) {
      throw new Error("Failed to generate question after all attempts");
    }
    // Try to clean and parse the response
    let cleanedContent = generatedContent;
    
    // Remove any markdown code blocks
    cleanedContent = cleanedContent.replace(/```json\s*|\s*```/g, '');
    cleanedContent = cleanedContent.replace(/```\s*|\s*```/g, '');
    
    // Remove any leading/trailing text that's not JSON
    const jsonMatch = cleanedContent.match(/\[.*\]/s);
    if (jsonMatch) {
      cleanedContent = jsonMatch[0];
    }

    // Additional cleaning: ensure the JSON is properly closed
    cleanedContent = cleanedContent.trim();
    
    // If the JSON doesn't end with ], try to fix it
    if (cleanedContent.startsWith('[') && !cleanedContent.endsWith(']')) {
      // Find the last complete string and add closing bracket
      const lastQuoteIndex = cleanedContent.lastIndexOf('"');
      if (lastQuoteIndex > 0) {
        cleanedContent = cleanedContent.substring(0, lastQuoteIndex + 1) + ']';
      }
    }

    try {
      const generatedQuestions = JSON.parse(cleanedContent);
      if (Array.isArray(generatedQuestions)) {
        // Use a Set to automatically handle duplicates from the AI response
        const uniqueQuestions = new Set<string>();

        // Limit to the requested count even if AI returns more
        const limitedQuestions = generatedQuestions.slice(0, generationCount);
        
        for (const questionText of limitedQuestions) {
          if (typeof questionText === 'string' && questionText.trim()) {
            const cleanedQuestion = questionText.trim().replace(/^["']|["']$/g, '');
            if (cleanedQuestion.length > 0) {
              uniqueQuestions.add(cleanedQuestion);
            }
          }
        }
        
        // Save the unique questions
        for (const questionText of uniqueQuestions) {
          try {
            const newQuestion = await ctx.runMutation(api.questions.saveAIQuestion, {
              text: questionText,
              style: styleId,
              tone: toneId,
              tags: selectedTags,
            });
            newQuestions.push(newQuestion);
          } catch (error) {
            console.error(`Failed to save question: "${questionText}"`, error);
            // Continue with other questions even if one fails
          }
        }
      } else {
        throw new Error("Response is not an array");
      }
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      console.error("Original content:", generatedContent);
      console.error("Cleaned content:", cleanedContent);

      // If parsing fails, we'll fall through to the main error handler,
      // which has its own fallback logic.
      throw e;
    }

    return newQuestions;
    } catch (error) {
      console.error("AI generation failed:", error);
      
      // Try to generate a single fallback question
      try {
        // console.log("Attempting fallback single question generation...");
        const fallbackCompletion = await openai.chat.completions.create({
          model: model ?? "@preset/break-the-ice-berg-default",
          messages: [
            {
              role: "system",
              content: "Generate a single engaging ice-breaker question. Respond with ONLY the question text, no quotes or formatting."
            },
            {
              role: "user",
              content: `Generate 1 ice-breaker question for style: ${styleId}, tone: ${toneId}`
            }
          ],
          max_tokens: 100,
          temperature: 0.7,
        });

        const fallbackContent = fallbackCompletion.choices[0]?.message?.content?.trim();
        if (fallbackContent) {
          const cleanedFallback = fallbackContent.replace(/^["']|["']$/g, '').trim();
          if (cleanedFallback.length > 0) {
            try {
              const fallbackQuestion = await ctx.runMutation(api.questions.saveAIQuestion, {
                text: cleanedFallback,
                style: styleId,
                tone: toneId,
                tags: selectedTags,
              });
              // console.log("Fallback question generated successfully");
              return [fallbackQuestion];
            } catch (error) {
              console.error("Failed to save fallback question:", error);
            }
          }
        }
      } catch (fallbackError) {
        console.error("Fallback generation also failed:", fallbackError);
        // If the fallback also fails, we want to throw the original error.
        // We'll fall through to the throw statement below.
      }
      
      // If we got to this point, the primary generation failed and the fallback
      // either failed or did not produce a question. In either case, we should
      // throw the original error to notify the client.
      throw error;
    }
  },
});

export const detectDuplicateQuestions = action({
  args: {},
  returns: v.object({
    processedCount: v.number(),
    duplicatesFound: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx): Promise<{
    processedCount: number;
    duplicatesFound: number;
    errors: string[];
  }> => {
    //call ai action detectDuplicateQuestionsAI
    return await ctx.runAction(internal.ai.detectDuplicateQuestionsAI, {});
  },
});

// New streaming version of duplicate detection
export const detectDuplicateQuestionsStreaming = action({
  args: {},
  returns: v.id("duplicateDetectionProgress"),
  handler: async (ctx): Promise<Id<"duplicateDetectionProgress">> => {
    // Start the streaming detection process
    return await ctx.runAction(internal.ai.detectDuplicateQuestionsStreamingAI, {});
  },
});

// Internal action for cron job
export const detectDuplicateQuestionsAI = internalAction({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    processedCount: v.number(),
    duplicatesFound: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 50;
    const errors: string[] = [];
    let processedCount = 0;
    let duplicatesFound = 0;

    try {
      // Get all questions in batches
      const allQuestions = await ctx.runQuery(internal.questions.getAllQuestionsForDuplicateDetection);
      
      // Process questions in batches to avoid token limits
      for (let i = 0; i < allQuestions.length; i += batchSize) {
        const batch = allQuestions.slice(i, i + batchSize);
        
        try {
          const duplicateGroups = await detectDuplicatesInBatch(batch);
          
          // Store each duplicate group as a detection record
          for (const group of duplicateGroups) {
            if (group.questionIds.length > 1) {
              await ctx.runMutation(internal.questions.saveDuplicateDetection, {
                questionIds: group.questionIds,
                reason: group.reason,
                confidence: group.confidence,
              });
              duplicatesFound += group.questionIds.length;
            }
          }
          
          processedCount += batch.length;
        } catch (error) {
          const errorMessage = `Error processing batch ${i}-${i + batchSize}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMessage);
          console.error(errorMessage);
        }
      }
    } catch (error) {
      const errorMessage = `Error in detectDuplicateQuestionsAI: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMessage);
      console.error(errorMessage);
    }

    return {
      processedCount,
      duplicatesFound,
      errors,
    };
  },
});

import { createDuplicateDetectionEmail, createMinimumQuestionsEmail } from "./lib/emails";

// New wrapper action for duplicate detection cron job
export const detectDuplicateQuestionsAndEmail = internalAction({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.runAction(internal.ai.detectDuplicateQuestionsAI, {
      batchSize: args.batchSize,
    });

    const { subject, html } = createDuplicateDetectionEmail(result);
    await ctx.runAction(internal.email.sendEmail, { subject, html });
  },
});

// New wrapper action for minimum questions cron job
export const ensureMinimumQuestionsPerCombinationAndEmail = internalAction({
  args: {
    minimumCount: v.optional(v.number()),
    maxCombinations: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.runAction(internal.ai.ensureMinimumQuestionsPerCombination, {
      minimumCount: args.minimumCount,
      maxCombinations: args.maxCombinations,
    });

    const { subject, html } = createMinimumQuestionsEmail(result);
    await ctx.runAction(internal.email.sendEmail, { subject, html });
  },
});

// Internal streaming action for duplicate detection with progress tracking
export const detectDuplicateQuestionsStreamingAI = internalAction({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.id("duplicateDetectionProgress"),
  handler: async (ctx, args): Promise<Id<"duplicateDetectionProgress">> => {
    const batchSize = args.batchSize ?? 50;
    
    // Get all questions first to calculate total
    const allQuestions = await ctx.runQuery(internal.questions.getAllQuestionsForDuplicateDetection);
    const totalQuestions = allQuestions.length;
    const totalBatches = Math.ceil(totalQuestions / batchSize);
    
    // Create initial progress record
    // Note: This will work once duplicates.ts is deployed and types are regenerated
    const progressId = await ctx.runMutation(api.duplicates.createDuplicateDetectionProgress as any, {
      totalQuestions,
      totalBatches,
    });
    
    // Process questions in batches with progress updates
    let processedCount = 0;
    let duplicatesFound = 0;
    const errors: string[] = [];
    
    try {
      for (let i = 0; i < allQuestions.length; i += batchSize) {
        const batch = allQuestions.slice(i, i + batchSize);
        const currentBatch = Math.floor(i / batchSize) + 1;
        
        try {
          // Update progress before processing batch
          await ctx.runMutation(api.duplicates.updateDuplicateDetectionProgress as any, {
            progressId,
            processedQuestions: processedCount,
            currentBatch,
            duplicatesFound,
            errors,
          });
          
          const duplicateGroups = await detectDuplicatesInBatch(batch);
          
          // Store each duplicate group as a detection record
          for (const group of duplicateGroups) {
            if (group.questionIds.length > 1) {
              await ctx.runMutation(internal.questions.saveDuplicateDetection, {
                questionIds: group.questionIds,
                reason: group.reason,
                confidence: group.confidence,
              });
              duplicatesFound += group.questionIds.length;
            }
          }
          
          processedCount += batch.length;
          
          // Update progress after processing batch
          await ctx.runMutation(api.duplicates.updateDuplicateDetectionProgress as any, {
            progressId,
            processedQuestions: processedCount,
            currentBatch,
            duplicatesFound,
            errors,
          });
          
        } catch (error) {
          const errorMessage = `Error processing batch ${currentBatch}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMessage);
          console.error(errorMessage);
          
          // Update progress with error
          await ctx.runMutation(api.duplicates.updateDuplicateDetectionProgress as any, {
            progressId,
            processedQuestions: processedCount,
            currentBatch,
            duplicatesFound,
            errors,
          });
        }
      }
      
      // Mark as completed
      await ctx.runMutation(api.duplicates.completeDuplicateDetectionProgress as any, {
        progressId,
        processedQuestions: processedCount,
        duplicatesFound,
        errors,
      });
      
    } catch (error) {
      const errorMessage = `Error in detectDuplicateQuestionsStreamingAI: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMessage);
      console.error(errorMessage);
      
      // Mark as failed
      await ctx.runMutation(api.duplicates.failDuplicateDetectionProgress as any, {
        progressId,
        errors,
      });
    }
    
    return progressId;
  },
});

// Helper function to detect duplicates in a batch of questions
async function detectDuplicatesInBatch(questions: Array<{_id: string, text: string, style: string}>) {
  if (questions.length < 2) return [];

  const prompt = `
You are an expert at detecting duplicate or very similar ice-breaker questions. Analyze the following questions and identify groups of questions that are essentially asking the same thing, even if worded differently.

Return your analysis as a JSON array where each element represents a group of duplicate questions:
[
  {
    "questionIds": ["id1", "id2", "id3"],
    "reason": "These questions all ask about favorite childhood memories with slightly different wording",
    "confidence": 0.95
  }
]

Guidelines:
- Group questions that have the same core meaning or intent
- Consider variations in wording, tense, or phrasing
- Only group questions with high confidence (0.8+)
- Each question can only be in one group
- Include the reason for grouping
- Confidence should be between 0.0 and 1.0
- Consider the style of the questions. If questions are in the same style, they will have similar wording and structure and therefore should NOT be considered duplicate based on style.

Questions to analyze:
${JSON.stringify(questions.map(q => ({ id: q._id, text: q.text, style: q.style })), null, 2)}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "@preset/break-the-ice-berg-duplicate-detection",
      messages: [
        {
          role: "system",
          content: "You are a duplicate question detector. Always respond with valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 200 * questions.length,
      temperature: 0.1, // Low temperature for consistent results
    });

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response) {
      throw new Error("No response from AI");
    }

    // Clean and parse the response
    let cleanedResponse = response;
    cleanedResponse = cleanedResponse.replace(/```json\s*|\s*```/g, '');
    const jsonMatch = cleanedResponse.match(/\[.*\]/s);
    if (jsonMatch) {
      cleanedResponse = jsonMatch[0];
    }

    if (!cleanedResponse) {
      // If the cleaned response is empty, there are no duplicates.
      return [];
    }
    const duplicateGroups = JSON.parse(cleanedResponse);
    
    if (!Array.isArray(duplicateGroups)) {
      throw new Error("Response is not an array");
    }

    return duplicateGroups;
  } catch (error) {
    console.error("Error in detectDuplicatesInBatch:", error);
    return [];
  }
}

// Internal action to ensure minimum questions per style/tone combination
export const ensureMinimumQuestionsPerCombination = internalAction({
  args: {
    minimumCount: v.optional(v.number()),
    maxCombinations: v.optional(v.number()),
  },
  returns: v.object({
    combinationsProcessed: v.number(),
    questionsGenerated: v.number(),
    errors: v.array(v.string()),
    hasMoreWork: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const minimumCount = args.minimumCount ?? 10;
    const maxCombinations = args.maxCombinations ?? 5; // Process max 5 combinations per run
    const errors: string[] = [];
    let combinationsProcessed = 0;
    let questionsGenerated = 0;
    let hasMoreWork = false;

    try {
      // Get all styles and tones
      const styles = await ctx.runQuery(api.styles.getStyles, {});
      const tones = await ctx.runQuery(api.tones.getTones, {});
      
      // Get current question counts by combination
      const currentCounts = await ctx.runQuery(internal.questions.getQuestionCountsByStyleAndTone, {});
      const countsMap = new Map(
        currentCounts.map((c: any) => [`${c.style}|${c.tone}`, c.count])
      );

      // Find combinations that need more questions
      const combinationsNeedingWork: Array<{style: any, tone: any, needed: number}> = [];
      
      for (const style of styles) {
        for (const tone of tones) {
          const key = `${style.id}|${tone.id}`;
          const currentCount = (countsMap.get(key) as number) || 0;
          
          if (currentCount < minimumCount) {
            const needed = minimumCount - currentCount;
            combinationsNeedingWork.push({ style, tone, needed });
          }
        }
      }

      // Check if there's more work to do
      hasMoreWork = combinationsNeedingWork.length > maxCombinations;

      // Process only the first batch of combinations
      const combinationsToProcess = combinationsNeedingWork.slice(0, maxCombinations);

      console.log(`Processing ${combinationsToProcess.length} combinations (${hasMoreWork ? 'more work remaining' : 'all work complete'})`);

      // Process each combination in the batch
      for (const { style, tone, needed } of combinationsToProcess) {
        console.log(`Generating ${needed} questions for ${style.name}/${tone.name}`);
        
        try {
          // Generate questions for this combination
          const newQuestions = await ctx.runAction(api.ai.generateAIQuestion, {
            selectedTags: [],
            style: style.id,
            tone: tone.id,
            count: needed,
          });
          
          questionsGenerated += newQuestions.filter((q: any) => q !== null).length;
          combinationsProcessed++;
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          const errorMessage = `Error generating questions for ${style.name}/${tone.name}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMessage);
          console.error(errorMessage);
        }
      }

    } catch (error) {
      const errorMessage = `Error in ensureMinimumQuestionsPerCombination: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMessage);
      console.error(errorMessage);
    }

    return {
      combinationsProcessed,
      questionsGenerated,
      errors,
      hasMoreWork,
    };
  },
});

// Public action to manually test the minimum questions functionality
export const testMinimumQuestionsGeneration: any = action({
  args: {
    minimumCount: v.optional(v.number()),
    maxCombinations: v.optional(v.number()),
  },
  returns: v.object({
    combinationsProcessed: v.number(),
    questionsGenerated: v.number(),
    errors: v.array(v.string()),
    hasMoreWork: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{
    combinationsProcessed: number;
    questionsGenerated: number;
    errors: string[];
    hasMoreWork: boolean;
  }> => {
    return await ctx.runAction(internal.ai.ensureMinimumQuestionsPerCombination, {
      minimumCount: args.minimumCount ?? 10,
      maxCombinations: args.maxCombinations ?? 5,
    });
  },
});

// Action to process all combinations in batches (for manual execution)
export const processAllCombinationsInBatches: any = action({
  args: {
    minimumCount: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    totalCombinationsProcessed: v.number(),
    totalQuestionsGenerated: v.number(),
    totalErrors: v.array(v.string()),
    completed: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{
    totalCombinationsProcessed: number;
    totalQuestionsGenerated: number;
    totalErrors: string[];
    completed: boolean;
  }> => {
    const minimumCount = args.minimumCount ?? 10;
    const batchSize = args.batchSize ?? 5;
    let totalCombinationsProcessed = 0;
    let totalQuestionsGenerated = 0;
    const totalErrors: string[] = [];
    let hasMoreWork = true;
    let batchCount = 0;
    const maxBatches = 20; // Safety limit to prevent infinite loops

    console.log(`Starting batch processing with batch size ${batchSize}, max ${maxBatches} batches`);

    while (hasMoreWork && batchCount < maxBatches) {
      batchCount++;
      console.log(`Processing batch ${batchCount}/${maxBatches}`);
      
      try {
        const result = await ctx.runAction(internal.ai.ensureMinimumQuestionsPerCombination, {
          minimumCount,
          maxCombinations: batchSize,
        });

        totalCombinationsProcessed += result.combinationsProcessed;
        totalQuestionsGenerated += result.questionsGenerated;
        totalErrors.push(...result.errors);
        hasMoreWork = result.hasMoreWork;

        console.log(`Batch ${batchCount} completed: ${result.combinationsProcessed} combinations, ${result.questionsGenerated} questions generated`);

        // Add delay between batches to avoid overwhelming the system
        if (hasMoreWork && batchCount < maxBatches) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay between batches
        }

      } catch (error) {
        const errorMessage = `Error in batch ${batchCount}: ${error instanceof Error ? error.message : String(error)}`;
        totalErrors.push(errorMessage);
        console.error(errorMessage);
        break; // Stop processing on error
      }
    }

    const completed = !hasMoreWork || batchCount >= maxBatches;
    console.log(`Batch processing completed: ${totalCombinationsProcessed} combinations processed, ${totalQuestionsGenerated} questions generated, completed: ${completed}`);

    return {
      totalCombinationsProcessed,
      totalQuestionsGenerated,
      totalErrors,
      completed,
    };
  },
});

