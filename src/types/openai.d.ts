declare module 'openai' {
  export default class OpenAI {
    constructor(config: { apiKey: string });
    chat: {
      completions: {
        create(params: {
          model: string;
          messages: Array<{
            role: string;
            content: string;
          }>;
          temperature?: number;
          max_tokens?: number;
        }): Promise<{
          choices: Array<{
            message?: {
              content?: string;
            };
          }>;
        }>;
      };
    };
  }
} 