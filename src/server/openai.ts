import OpenAI from 'openai';
import { env } from '~/env';
import { TRPCError } from '@trpc/server';
import type { Question } from '~/app/_components/types';

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export async function generateIcebreakerQuestion(discardPile: Question[] = []): Promise<string> {
  try {
    const discardPileText = discardPile.length > 0 
      ? `\n\nHere are some example questions that have been discarded, please generate a different type of question:\n${discardPile.map(q => `- ${q.text}`).join('\n')}`
      : '';

    const prompt = `Generate a fun, engaging icebreaker question that would be suitable for a social gathering or team building activity. The question should be:
1. Light-hearted
2. Open-ended enough to spark interesting conversations
3. Suitable for most adults
4. Creative and unique
5. Feel free to add some sass and personality to the question${discardPileText}

Format the response as just the question text, without any additional commentary or formatting.`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that generates engaging icebreaker questions."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 100,
    });

    const question = response.choices[0]?.message?.content?.trim();
    if (!question) {
      throw new Error("Failed to generate question");
    }
    
    return question;
  } catch (error) {
    console.error("Error generating AI question:", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to generate AI question",
    });
  }
} 