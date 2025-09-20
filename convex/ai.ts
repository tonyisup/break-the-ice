"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import OpenAI from "openai";
import { api, internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPEN_ROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://breaktheiceberg.com', 
    'X-Title': 'Break the ice(berg)', 
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
  },
  returns: v.array(v.union(v.any(), v.null())),
  handler: async (ctx, args): Promise<(Doc<"questions"> | null)[]> => {
    const { selectedTags, currentQuestion, style: styleId, tone: toneId, model, count } = args;
    const generationCount = count ?? 1;
    const newQuestions: (Doc<"questions"> | null)[] = [];

    try {

    const existingQuestions = await ctx.runQuery(api.questions.getNextQuestions, {
      count: 5,
      style: styleId,
      tone: toneId,
    });

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
      existingQuestions: existingQuestions.map((q) => q.text),
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
          max_tokens: 200 * generationCount,
          temperature: 0.7,
        });

        generatedContent = completion.choices[0]?.message?.content?.trim() || "";
        
        if (!generatedContent) {
          // console.log(`Attempt ${attempts}: No content generated`);
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
            continue;
          }
          throw new Error("Failed to generate question after multiple attempts");
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
        // Limit to the requested count even if AI returns more
        const limitedQuestions = generatedQuestions.slice(0, generationCount);
        // console.log(`AI returned ${generatedQuestions.length} questions, limiting to ${limitedQuestions.length}`);
        
        for (const questionText of limitedQuestions) {
          if (typeof questionText === 'string' && questionText.trim()) {
            const cleanedQuestion = questionText.trim().replace(/^["']|["']$/g, '');
            if (cleanedQuestion.length > 0) {
              try {
                const newQuestion = await ctx.runMutation(api.questions.saveAIQuestion, {
                  text: cleanedQuestion,
                  style: styleId,
                  tone: toneId,
                  tags: selectedTags,
                });
                newQuestions.push(newQuestion);
              } catch (error) {
                console.error("Failed to save question:", error);
                // Continue with other questions even if one fails
              }
            }
          }
        }
      } else {
        throw new Error("Response is not an array");
      }
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", e);
      console.error("Original content:", generatedContent);
      console.error("Cleaned content:", cleanedContent);
      console.error("Content length:", cleanedContent.length);
      
      // Try to extract individual questions from the response
      const questionMatches = generatedContent.match(/"([^"]+)"/g);
      if (questionMatches && questionMatches.length > 0) {
        // Limit to the requested count even if regex finds more
        const limitedMatches = questionMatches.slice(0, generationCount);
        // console.log(`Regex found ${questionMatches.length} questions, limiting to ${limitedMatches.length}`);
        
        for (const match of limitedMatches) {
          const questionText = match.replace(/"/g, '').trim();
          if (questionText.length > 0) {
            try {
              const newQuestion = await ctx.runMutation(api.questions.saveAIQuestion, {
                text: questionText,
                style: styleId,
                tone: toneId,
                tags: selectedTags,
              });
              newQuestions.push(newQuestion);
            } catch (error) {
              console.error("Failed to save extracted question:", error);
              // Continue with other questions even if one fails
            }
          }
        }
      } else {
        // Last resort: treat the entire response as a single question
        const cleanedQuestion = generatedContent.replace(/^["']|["']$/g, '').trim();
        if (cleanedQuestion.length > 0) {
          try {
            const newQuestion = await ctx.runMutation(api.questions.saveAIQuestion, {
              text: cleanedQuestion,
              style: styleId,
              tone: toneId,
              tags: selectedTags,
            });
            newQuestions.push(newQuestion);
          } catch (error) {
            console.error("Failed to save fallback question:", error);
          }
        }
      }
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
      }
      
      // Return empty array on complete failure
      return [];
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
      max_tokens: 2000,
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