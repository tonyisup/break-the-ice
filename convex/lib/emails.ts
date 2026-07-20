type DuplicateDetectionResult = {
  processedCount: number;
  duplicatesFound: number;
  errors: string[];
};

export const createDuplicateDetectionEmail = (result: DuplicateDetectionResult) => {
  const subject = "Cron Job Summary: Duplicate Question Detection";
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Duplicate Question Detection Summary</title>
    </head>
    <body>
      <h1>Duplicate Question Detection Summary</h1>
      <p><strong>Processed Count:</strong> ${result.processedCount}</p>
      <p><strong>Duplicates Found:</strong> ${result.duplicatesFound}</p>
      <p><strong>Errors:</strong> ${result.errors.length > 0 ? result.errors.join("<br>") : "None"}</p>
    </body>
    </html>
  `;
  return { subject, html };
};

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const createSubscriptionNotificationEmail = (email: string) => {
  const subject = "New Newsletter Subscription";
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>New Newsletter Subscription</title>
    </head>
    <body>
      <h1>New Newsletter Subscription</h1>
      <p>A new user has subscribed to the newsletter:</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    </body>
    </html>
  `;
  return { subject, html };
};

export const createDailyQuestionEmail = (args: {
  question: string;
  questionUrl: string;
  unsubscribeUrl: string;
}) => {
  const subject = "🧊 Your Icebreaker for Today 🧊";
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 12px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #2563eb; margin: 0; font-size: 24px; }
        .question-box { background: #f8fafc; padding: 30px; border-radius: 16px; margin: 20px 0; text-align: center; border: 1px solid #e2e8f0; }
        .question-text { font-size: 20px; font-weight: 600; color: #1e293b; margin-bottom: 20px; }
        .button-container { text-align: center; margin: 30px 0; }
        .button { background-color: #2563eb; color: white !important; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; }
        .footer { text-align: center; font-size: 12px; color: #64748b; margin-top: 40px; }
        .unsubscribe { margin-top: 20px; display: block; text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Icebreaker of the Day</h1>
        </div>

        <div class="question-box">
          <p class="question-text">${escapeHtml(args.question)}</p>
        </div>

        <div class="button-container">
          <a href="${escapeHtml(args.questionUrl)}" class="button">View on Break the Iceberg</a>
        </div>

        <div class="footer">
          <p>You're receiving this because you subscribed to Break the Iceberg daily questions.</p>
          <p>&copy; 2026 Break the Iceberg. All rights reserved.</p>
          <p><a href="${escapeHtml(args.unsubscribeUrl)}" class="unsubscribe">Unsubscribe</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
  return { subject, html };
};

type MinimumQuestionsResult = {
  combinationsProcessed: number;
  questionsGenerated: number;
  errors: string[];
  hasMoreWork: boolean;
};

export const createMinimumQuestionsEmail = (result: MinimumQuestionsResult) => {
  const subject = "Cron Job Summary: Ensure Minimum Questions";
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Ensure Minimum Questions Summary</title>
    </head>
    <body>
      <h1>Ensure Minimum Questions Summary</h1>
      <p><strong>Combinations Processed:</strong> ${result.combinationsProcessed}</p>
      <p><strong>Questions Generated:</strong> ${result.questionsGenerated}</p>
      <p><strong>More Work Remaining:</strong> ${result.hasMoreWork}</p>
      <p><strong>Errors:</strong> ${result.errors.length > 0 ? result.errors.join("<br>") : "None"}</p>
    </body>
    </html>
  `;
  return { subject, html };
};

export type PopulateMissingEmbeddingsResult = {
  questionsProcessed: number;
  questionsMissingEmbeddings: number;
  errors: string[];
};
export const createPopulateMissingEmbeddingsEmail = (result: PopulateMissingEmbeddingsResult) => {
  const subject = "Cron Job Summary: Populate Missing Embeddings";
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Populate Missing Embeddings Summary</title>
    </head>
    <body>
      <h1>Populate Missing Embeddings Summary</h1>
      <p><strong>Questions Processed:</strong> ${result.questionsProcessed}</p>
      <p><strong>Questions Missing Embeddings:</strong> ${result.questionsMissingEmbeddings}</p>
      <p><strong>Errors:</strong> ${result.errors.length > 0 ? result.errors.join("<br>") : "None"}</p>
    </body>
    </html>
  `;
  return { subject, html };
};
export type PrunedStaleQuestionsResult = {
  questionsDeleted: number;
  errors: string[];
};
export const createPrunedStaleQuestionsEmail = (result: PrunedStaleQuestionsResult) => {
  const subject = "Cron Job Summary: Prune Stale Questions";
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Pruned Stale Questions Summary</title>
    </head>
    <body>
      <h1>Pruned Stale Questions Summary</h1>
      <p><strong>Questions Deleted:</strong> ${result.questionsDeleted}</p>
      <p><strong>Errors:</strong> ${result.errors.length > 0 ? result.errors.join("<br>") : "None"}</p>
    </body>
    </html>
  `;
  return { subject, html };
};

export type PopulateMissingStyleEmbeddingsResult = {
  stylesProcessed: number;
  stylesMissingEmbeddings: number;
  errors: string[];
};

export const createPopulateMissingStyleEmbeddingsEmail = (result: PopulateMissingStyleEmbeddingsResult) => {
  const subject = "Cron Job Summary: Populate Missing Style Embeddings";
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Populate Missing Style Embeddings Summary</title>
    </head>
    <body>
      <h1>Populate Missing Style Embeddings Summary</h1>
      <p><strong>Styles Processed:</strong> ${result.stylesProcessed}</p>
      <p><strong>Styles Missing Embeddings:</strong> ${result.stylesMissingEmbeddings}</p>
      <p><strong>Errors:</strong> ${result.errors.length > 0 ? result.errors.join("<br>") : "None"}</p>
    </body>
    </html>
  `;
  return { subject, html };
};

export type PopulateMissingToneEmbeddingsResult = {
  tonesProcessed: number;
  tonesMissingEmbeddings: number;
  errors: string[];
};

export const createPopulateMissingToneEmbeddingsEmail = (result: PopulateMissingToneEmbeddingsResult) => {
  const subject = "Cron Job Summary: Populate Missing Tone Embeddings";
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Populate Missing Tone Embeddings Summary</title>
    </head>
    <body>
      <h1>Populate Missing Tone Embeddings Summary</h1>
      <p><strong>Tones Processed:</strong> ${result.tonesProcessed}</p>
      <p><strong>Tones Missing Embeddings:</strong> ${result.tonesMissingEmbeddings}</p>
      <p><strong>Errors:</strong> ${result.errors.length > 0 ? result.errors.join("<br>") : "None"}</p>
    </body>
    </html>
  `;
  return { subject, html };
};
