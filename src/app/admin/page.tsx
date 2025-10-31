import React, { useState } from 'react';
import { Authenticated, Unauthenticated, AuthLoading } from 'convex/react';
import { SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { useTheme } from '../../hooks/useTheme';
import { Link } from 'react-router-dom';
import { HouseIcon } from '@/components/ui/icons/icons';
import { AnimatePresence } from 'framer-motion';
import { AIQuestionGenerator } from '../../components/ai-question-generator/ai-question-generator';

const AdminPage: React.FC = () => {
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
  const { isSignedIn, user } = useUser();
  if (!isSignedIn) {
    return <div>You are not logged in</div>;
  }
  if (!user?.publicMetadata?.isAdmin) {
    return <div>You are not an admin</div>;
  }
  return <AdminComponent />;
}
function AdminComponent() {
  const { theme, setTheme } = useTheme();
  const [showAIGenerator, setShowAIGenerator] = useState(false);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <Link to="/" className="text-gray-500 flex items-center gap-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors text-sm sm:text-base">
            <HouseIcon />
            Home
          </Link>
          <button
            onClick={() => setShowAIGenerator(true)}
            className="p-2 rounded-lg bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-colors text-white"
          >
            🤖 AI Generator
          </button>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )}
            </button>
            <div className="p-2">
              <UserButton />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link to="/admin/questions" className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Manage Questions</h2>
            <p className="text-gray-600 dark:text-gray-400">Create, edit, and delete questions.</p>
          </Link>
          <Link to="/admin/tags" className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Manage Tags</h2>
            <p className="text-gray-600 dark:text-gray-400">Create, edit, and delete tags.</p>
          </Link>
          <Link to="/admin/models" className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Manage Models</h2>
            <p className="text-gray-600 dark:text-gray-400">Create, edit, and delete models.</p>
          </Link>
          <Link to="/admin/styles" className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Manage Styles</h2>
            <p className="text-gray-600 dark:text-gray-400">Create, edit, and delete styles.</p>
          </Link>
          <Link to="/admin/tones" className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Manage Tones</h2>
            <p className="text-gray-600 dark:text-gray-400">Create, edit, and delete tones.</p>
          </Link>
          <Link to="/admin/duplicates" className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Review Duplicates</h2>
            <p className="text-gray-600 dark:text-gray-400">Review AI-detected duplicate questions.</p>
          </Link>
          <Link to="/admin/duplicates/completed" className="block p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Completed Duplicate Reviews</h2>
            <p className="text-gray-600 dark:text-gray-400">View history of completed duplicate reviews.</p>
          </Link>
        </div>
      </div>
      
      <AnimatePresence>
        {showAIGenerator && (
          <AIQuestionGenerator
            onQuestionGenerated={() => setShowAIGenerator(false)}
            onClose={() => setShowAIGenerator(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminPage;
