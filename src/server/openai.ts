import OpenAI from 'openai';
import { env } from '~/env';
import { TRPCError } from '@trpc/server';
import type { Question } from '@prisma/client';

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export type GeneratedQuestion = {
  text: string;
  tags: string[];
};

interface AIResponse {
  question: string;
  tags: string[];
}

interface GenerateIcebreakerQuestionProps {
  skips: Question[];
  likes: Question[];
  skipTags: string[];
  likeTags: string[];
  skipCategories: string[];
  likeCategories: string[];
}

export async function generateIcebreakerQuestion({ skips, likes, skipTags, likeTags, skipCategories, likeCategories }: GenerateIcebreakerQuestionProps): Promise<GeneratedQuestion> {
  try {
    // const skipsText = skips.length > 0 
    //   ? `\n\n- Here are some example questions that have been discarded, please generate a different type of question:\n${skips.map(q => `- ${q.text}`).join('\n')}`
    //   : '';

    // const likesText = likes.length > 0 
    //   ? `\n\n- Here are some example questions that have been liked, please generate more of the same type of question:\n${likes.map(q => `- ${q.text}`).join('\n')}`
    //   : '';
    const skipsText = '';
    const likesText = '';
    
    const skipTagsText = skipTags.length > 0 
      ? `\n\n- Here are some example tags that have been discarded, please generate a different type of tag:\n${skipTags.join('\n')}`
      : ''; 

    const likeTagsText = likeTags.length > 0 
      ? `\n\n- Here are some example tags that have been liked, please generate more of the same type of tag:\n${likeTags.join('\n')}`
      : '';

    const skipCategoriesText = skipCategories.length > 0 
      ? `\n\n- Here are some example categories that have been discarded, please generate a different type of category:\n${skipCategories.join('\n')}`
      : '';

    const likeCategoriesText = likeCategories.length > 0 
      ? `\n\n- Here are some example categories that have been liked, please generate more of the same type of category:\n${likeCategories.join('\n')}`
      : '';

    const prompt = `Generate a fun, engaging icebreaker question that would be suitable for a social gathering or team building activity. The question should be:
- Light-hearted
- Open-ended enough to spark interesting conversations
- Suitable for most adults
- Creative and unique
- Feel free to add some sass and personality to the question${skipsText}${likesText}${skipTagsText}${likeTagsText}${skipCategoriesText}${likeCategoriesText}

Also, generate 3-5 relevant tags for this question. Tags should be short, descriptive words or phrases that categorize the question.

Format the response as a JSON object with the following structure:
{
  "question": "Your question text here",
  "tags": ["tag1", "tag2", "tag3"]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that generates engaging icebreaker questions with relevant tags."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 300
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("Failed to generate question");
    }
    
    try {
      const parsedContent = JSON.parse(content) as AIResponse;
      return {
        text: parsedContent.question,
        tags: parsedContent.tags
      };
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to parse AI response",
      });
    }
  } catch (error) {
    console.error("Error generating AI question:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to generate AI question",
    });
  }
} 