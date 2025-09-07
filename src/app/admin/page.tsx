import React, { useState } from 'react';
import { useQuery, useMutation, Authenticated, Unauthenticated, AuthLoading } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Doc, Id } from '../../../convex/_generated/dataModel';
import { SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { useTheme } from '../../hooks/useTheme';
import { categories } from '../../components/category-selector/category-selector';

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
  const isLoggedIn = useQuery(api.auth.loggedInUser);
  const user = useUser();
  if (!isLoggedIn) {
    return <div>You are not logged in</div>;
  }
  if (!user.user?.publicMetadata.isAdmin) {
    return <div>You are not an admin</div>;
  }
  return <AdminComponent />;
}
function AdminComponent() {
  const questions = useQuery(api.questions.getQuestions);
  const createQuestion = useMutation(api.questions.createQuestion);
  const updateQuestion = useMutation(api.questions.updateQuestion);
  const deleteQuestion = useMutation(api.questions.deleteQuestion);
  const { theme, setTheme } = useTheme();
  const selectorCategories = categories.filter(category => !category.hidden);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionCategory, setNewQuestionCategory] = useState('');
  const [editingQuestion, setEditingQuestion] = useState<Doc<"questions"> | null>(null);
  const [searchText, setSearchText] = useState('');

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const handleCreateQuestion = () => {
    if (newQuestionText.trim()) {
      void createQuestion({
        text: newQuestionText,
        category: newQuestionCategory || undefined
      });
      setNewQuestionText('');
      setNewQuestionCategory('');
    }
  };

  const handleUpdateQuestion = () => {
    if (editingQuestion && editingQuestion.text.trim()) {
      void updateQuestion({
        id: editingQuestion._id,
        text: editingQuestion.text,
        category: editingQuestion.category || undefined
      });
      setEditingQuestion(null);
    }
  };

  const handleDeleteQuestion = (id: Id<"questions">) => {
    void deleteQuestion({ id });
  };

  const clearSearchText = () => {
    setSearchText('');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Portal</h1>
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

        <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Create New Question</h2>
          <div className="space-y-4">
            <input
              type="text"
              value={newQuestionText}
              onChange={(e) => setNewQuestionText(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter new question text"
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={newQuestionCategory}
                onChange={(e) => setNewQuestionCategory(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent sm:w-1/2"
              >
                <option value="">Select a category (optional)</option>
                {selectorCategories?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCreateQuestion}
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>

        <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex gap-3">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Search questions..."
          />
          <button
            onClick={clearSearchText}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Clear
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Manage Questions</h2>
          </div>
          {/* Mobile View */}
          <div className="md:hidden">
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {questions?.filter(q => q.text.toLowerCase().includes(searchText.toLowerCase()))?.map((q) => (
                <div key={q._id} className="p-4 space-y-3">
                  {editingQuestion?._id === q._id ? (
                    <div className="space-y-3">
                      <textarea
                        value={editingQuestion.text}
                        onChange={(e) => setEditingQuestion({ ...editingQuestion, text: e.target.value })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={3}
                      />
                      <select
                        value={editingQuestion.category || ''}
                        onChange={(e) => setEditingQuestion({ ...editingQuestion, category: e.target.value || undefined })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">No category</option>
                        {selectorCategories?.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button onClick={handleUpdateQuestion} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1">Save</button>
                        <button onClick={() => setEditingQuestion(null)} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-gray-900 dark:text-white">{q.text}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{q.category || 'No category'}</p>
                      <div className="flex gap-2 pt-2">
                        <button onClick={() => setEditingQuestion(q)} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Edit</button>
                        <button onClick={() => handleDeleteQuestion(q._id)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          {/* Desktop View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white w-1/2">Question</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white w-1/4">Category</th>
                  <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white w-1/4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {questions?.map((q) => (
                  <tr key={q._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="p-4 align-top">
                      {editingQuestion?._id === q._id ? (
                        <textarea
                          value={editingQuestion.text}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, text: e.target.value })}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          rows={2}
                        />
                      ) : (
                        <span className="text-gray-900 dark:text-white">{q.text}</span>
                      )}
                    </td>
                    <td className="p-4 align-top">
                      {editingQuestion?._id === q._id ? (
                        <select
                          value={editingQuestion.category || ''}
                          onChange={(e) => setEditingQuestion({ ...editingQuestion, category: e.target.value || undefined })}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">No category</option>
                          {selectorCategories?.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-gray-600 dark:text-gray-400">
                          {q.category || <em>No category</em>}
                        </span>
                      )}
                    </td>
                    <td className="p-4 align-top">
                      <div className="flex gap-2">
                        {editingQuestion?._id === q._id ? (
                          <div className="flex gap-2">
                            <button onClick={handleUpdateQuestion} className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Save</button>
                            <button onClick={() => setEditingQuestion(null)} className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setEditingQuestion(q)} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Edit</button>
                        )}
                        <button onClick={() => handleDeleteQuestion(q._id)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
