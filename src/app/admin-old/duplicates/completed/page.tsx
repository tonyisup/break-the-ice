import React from 'react';
import { useQuery, Authenticated, Unauthenticated, AuthLoading } from 'convex/react';
import { SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@/components/ui/icons/icons';
import { useTheme } from '@/hooks/useTheme';
import { api } from '../../../../../convex/_generated/api';

const CompletedDuplicateDetectionsPage: React.FC = () => {
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
  if (!user.isSignedIn) {
    return <div>You are not logged in</div>;
  }
  if (!user.user?.publicMetadata.isAdmin) {
    return <div>You are not an admin</div>;
  }
  return <CompletedDuplicateDetectionsComponent />;
}

function CompletedDuplicateDetectionsComponent() {
  const { theme, setTheme } = useTheme();
  const duplicateDetections = useQuery(api.questions.getCompletedDuplicateDetections);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  if (!duplicateDetections) {
    return <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
      <div className="text-gray-600 dark:text-gray-400">Loading...</div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6 justify-between">
          <Link to="/admin/duplicates" className="text-gray-500 flex items-center gap-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
            <ArrowLeftIcon className="w-4 h-4" />
            <span>Back to Pending Reviews</span>
          </Link>
          <div className="flex items-center gap-4">
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Completed Duplicate Reviews</h1>
          <p className="text-gray-600 dark:text-gray-400">
            History of all duplicate question reviews that have been approved or rejected.
          </p>
        </div>

        {duplicateDetections.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 text-lg">No completed duplicate reviews found.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {duplicateDetections.map((detection: any) => (
              <div key={detection._id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        Duplicate Group ({detection.questionIds.length} questions)
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        <strong>Reason:</strong> {detection.reason}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        <strong>Confidence:</strong> {(detection.confidence * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${detection.status === 'approved' || detection.status === 'deleted' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {detection.status.charAt(0).toUpperCase() + detection.status.slice(1)}
                      </p>
                      {detection.reviewedAt && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(detection.reviewedAt).toLocaleString()}
                        </p>
                      )}
                      {detection.reviewer && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          by {detection.reviewer.name}
                        </p>
                      )}
                    </div>
                  </div>
                  {detection.status === 'rejected' && detection.rejectReason && (
                    <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <p className="text-sm text-red-800 dark:text-red-200">
                        <strong>Rejection Reason:</strong> {detection.rejectReason}
                      </p>
                    </div>
                  )}
                  <div className="space-y-3 mt-4">
                    {detection.questions.map((question: any) => (
                      <div key={question._id} className="p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                        <p className="text-gray-900 dark:text-white font-medium">
                          <Link to={`/admin/questions/${question._id}`} className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors">{question.text}</Link>
                        </p>
                        <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400 mt-2">
                          <span>Likes: {question.totalLikes}</span>
                          <span>Shows: {question.totalShows}</span>
                          {question.style && <span>Style: {question.style}</span>}
                          {question.tone && <span>Tone: {question.tone}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CompletedDuplicateDetectionsPage;
