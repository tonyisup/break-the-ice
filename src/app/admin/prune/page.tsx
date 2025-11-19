import React, { useState } from 'react';
import { useQuery, useAction, Authenticated, Unauthenticated, AuthLoading, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { useTheme } from '@/hooks/useTheme';
import { Link } from 'react-router-dom';
import { HouseIcon, ArrowLeftIcon, CheckIcon, TrashIcon, AlertCircleIcon, CheckCircleIcon, ThumbsUpIcon } from '@/components/ui/icons/icons';
import { Button } from '@/components/ui/button';
import { Id } from '../../../../convex/_generated/dataModel';

const PrunePage: React.FC = () => {
  return (
    <main>
      <Unauthenticated>
        <SignInButton />
      </Unauthenticated>
      <Authenticated>
        <AdminComponentWrapper />
      </Authenticated>
      <AuthLoading>
        <p>Still loading</p>
      </AuthLoading>
    </main>
  )
};

function AdminComponentWrapper() {
  const user = useUser();
	if (!user.user?.publicMetadata.isAdmin) {
		return <div>You are not an admin</div>;
	}
  return <PruneManager />;
}

function PruneManager() {
  const { theme, setTheme } = useTheme();
  const [maxQuestions, setMaxQuestions] = useState<number>(50);
  const [sendEmail, setSendEmail] = useState<boolean>(false);
  const [isPruning, setIsPruning] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<{ questionsDeleted: number; errors: string[] } | null>(null);

  const pruneStaleQuestions = useAction(api.questions.pruneStaleQuestionsAdmin);
  const doNotPruneQuestion = useMutation(api.questions.doNotPruneQuestion);
  const staleQuestions = useQuery(api.questions.getStaleQuestionsPreview, { maxQuestions });

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const handleDoNotPruneQuestion = (questionId: Id<"questions">) => {
    void doNotPruneQuestion({ questionId });
  };

  const handlePrune = () => {
    if (!window.confirm(`Are you sure you want to prune up to ${maxQuestions} stale questions? This action cannot be undone.`)) {
      return;
    }

    void (async () => {
      try {
        setIsPruning(true);
        setLastResult(null);
        const result = await pruneStaleQuestions({
          maxQuestions,
          sendEmail,
        });
        setLastResult(result);
        // The query will automatically refresh when the data changes
      } catch (error) {
        console.error('Error pruning questions:', error);
        setLastResult({
          questionsDeleted: 0,
          errors: [`Error: ${error instanceof Error ? error.message : String(error)}`],
        });
      } finally {
        setIsPruning(false);
      }
    })();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6 justify-between">
          <Link to="/admin" className="text-gray-500 flex items-center gap-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
            <ArrowLeftIcon className="w-4 h-4" />
          </Link>
          <Link to="/" className="text-gray-500 flex items-center gap-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors text-sm sm:text-base">
            <HouseIcon />
          </Link>
          <div className="ml-auto">
            <button
              onClick={toggleTheme}
              className="p-2 sm:p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? (
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )}
            </button>
            <UserButton />
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Prune Stale Questions</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Remove questions that are at least 1 week old, have been shown but have 0 likes, and haven't been pruned yet.
          </p>
        </div>

        {/* Stale Questions Preview */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Questions to be Pruned
              {staleQuestions !== undefined && (
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({staleQuestions.length} {staleQuestions.length === 1 ? 'question' : 'questions'})
                </span>
              )}
            </h2>
          </div>

          {staleQuestions === undefined ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Loading stale questions...
            </div>
          ) : staleQuestions.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <CheckCircleIcon className="w-12 h-12 mx-auto mb-2 text-green-500" />
              <p>No stale questions found to prune.</p>
              <p className="text-sm mt-2">All questions either have likes, haven't been shown, or are too recent.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {staleQuestions.map((question) => {
                const questionText = question.text ?? question.customText ?? 'No text';
                const daysOld = Math.floor((Date.now() - question._creationTime) / (1000 * 60 * 60 * 24));
                
                return (
                  <div
                    key={question._id}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 dark:text-white font-medium mb-2 break-words">
                          {questionText}
                        </p>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                          {question.style && question.tone && (
                            <span className="inline-flex items-center px-2 py-1 rounded bg-gray-100 dark:bg-gray-700">
                              {question.style} / {question.tone}
                            </span>
                          )}
                          <span>Shown: {question.totalShows}</span>
                          <span>Likes: {question.totalLikes}</span>
                          {question.totalThumbsDown && question.totalThumbsDown > 0 && (
                            <span>Dislikes: {question.totalThumbsDown}</span>
                          )}
                          <span>Age: {daysOld} {daysOld === 1 ? 'day' : 'days'}</span>
                          {question.lastShownAt && (
                            <span>
                              Last shown: {new Date(question.lastShownAt).toLocaleDateString()}
                            </span>
                          )}
                          <span>
                            {/* add  Keep button to not prune this question */}
                            <Button onClick={() => handleDoNotPruneQuestion(question._id)}>
                              <ThumbsUpIcon className="w-4 h-4" />
                            </Button>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="maxQuestions" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Maximum Questions to Prune
              </label>
              <input
                id="maxQuestions"
                type="number"
                min="1"
                max="1000"
                value={maxQuestions}
                onChange={(e) => setMaxQuestions(parseInt(e.target.value) || 50)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isPruning}
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Default: 50 (matches the daily cron job setting)
              </p>
            </div>

            <div className="flex items-center">
              <input
                id="sendEmail"
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                disabled={isPruning}
              />
              <label htmlFor="sendEmail" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Send email notification with results
              </label>
            </div>

            <button
              onClick={handlePrune}
              disabled={isPruning}
              className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isPruning ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Pruning...
                </>
              ) : (
                <>
                  <TrashIcon className="w-5 h-5" />
                  Prune Stale Questions
                </>
              )}
            </button>
          </div>
        </div>

        {lastResult && (
          <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 ${
            lastResult.errors.length > 0 ? 'border-l-4 border-yellow-500' : 'border-l-4 border-green-500'
          }`}>
            <div className="flex items-start gap-3 mb-4">
              {lastResult.errors.length > 0 ? (
                <AlertCircleIcon className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" />
              ) : (
                <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Prune Results
                </h2>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-700 dark:text-gray-300 font-medium">Questions Pruned:</span>
                    <span className="text-gray-900 dark:text-white font-bold">{lastResult.questionsDeleted}</span>
                  </div>
                  {lastResult.errors.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-2">Errors:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {lastResult.errors.map((error, index) => (
                          <li key={index} className="text-sm text-yellow-600 dark:text-yellow-500">
                            {error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {lastResult.errors.length === 0 && lastResult.questionsDeleted > 0 && (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                      Successfully pruned {lastResult.questionsDeleted} stale question{lastResult.questionsDeleted !== 1 ? 's' : ''}.
                    </p>
                  )}
                  {lastResult.errors.length === 0 && lastResult.questionsDeleted === 0 && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      No stale questions found to prune.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">About Pruning</h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
            <li>Questions are marked as pruned (not deleted) by setting the <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">prunedAt</code> timestamp</li>
            <li>Only questions that meet all criteria are pruned: at least 1 week old, shown at least once, 0 likes, and not already pruned</li>
            <li>This process runs automatically daily via cron job at 2 AM UTC</li>
            <li>You can manually trigger it here with custom parameters</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default PrunePage;

