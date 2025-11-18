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