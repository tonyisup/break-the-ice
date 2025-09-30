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