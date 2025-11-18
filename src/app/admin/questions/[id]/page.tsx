import React, { useState } from 'react';
import { useQuery, useMutation, Authenticated, Unauthenticated, AuthLoading } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { HouseIcon, ArrowLeftIcon, SaveIcon, XIcon } from '@/components/ui/icons/icons';
import { useTheme } from '@/hooks/useTheme';

const IndividualQuestionPage: React.FC = () => {
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
  return <IndividualQuestionEditor />;
}

function IndividualQuestionEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useUser();
  const { theme, setTheme } = useTheme();
  
  const [editedText, setEditedText] = useState<string>("");
  const [editedStyle, setEditedStyle] = useState<string>("");
  const [editedTone, setEditedTone] = useState<string>("");
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [hasChanges, setHasChanges] = useState<boolean>(false);

  const question = useQuery(api.questions.getQuestion, { id: id as Id<"questions"> });
  const styles = useQuery(api.styles.getStyles);
  const tones = useQuery(api.tones.getTones);
  const updateQuestion = useMutation(api.questions.updateQuestion);
  const deleteQuestion = useMutation(api.questions.deleteQuestion);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  // Initialize form when question loads
  React.useEffect(() => {
    if (question && question.text) {
      setEditedText(question.text);
      setEditedStyle(question.style || "");
      setEditedTone(question.tone || "");
      setIsEditing(false);
      setHasChanges(false);
    }
  }, [question]);

  // Check for changes
  React.useEffect(() => {
    if (question) {
      const textChanged = editedText !== question.text;
      const styleChanged = editedStyle !== (question.style || "");
      const toneChanged = editedTone !== (question.tone || "");
      setHasChanges(textChanged || styleChanged || toneChanged);
    }
  }, [editedText, editedStyle, editedTone, question]);

  const handleStartEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (question && question.text) {
      setEditedText(question.text);
      setEditedStyle(question.style || "");
      setEditedTone(question.tone || "");
    }
    setIsEditing(false);
    setHasChanges(false);
  };

  const handleSaveEdit = async () => {
    if (!question || editedText.trim() === "") {
      alert("Question text cannot be empty");
      return;
    }

    try {
      await updateQuestion({
        id: question._id,
        text: editedText.trim(),
        style: editedStyle || undefined,
        tone: editedTone || undefined,
      });
      setIsEditing(false);
      setHasChanges(false);
    } catch (error) {
      console.error('Error updating question:', error);
      alert('Error updating question');
    }
  };

  const handleDeleteQuestion = async () => {
    if (!question) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete this question?\n\n"${question.text}"\n\nThis action cannot be undone.`
    );
    
    if (confirmed) {
      try {
        await deleteQuestion({ id: question._id });
        void navigate('/admin/questions');
      } catch (error) {
        console.error('Error deleting question:', error);
        alert('Error deleting question');
      }
    }
  };

  if (!question) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading question...</div>
      </div>
    );
  }

  const styleName = styles?.find((s) => s.id === question.style)?.name ?? "No style";
  const toneName = tones?.find((t) => t.id === question.tone)?.name ?? "No tone";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link to="/admin/questions" className="text-gray-500 flex items-center gap-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Questions
          </Link>
          <Link to="/admin" className="text-gray-500 flex items-center gap-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors text-sm sm:text-base">
            <HouseIcon />
            Admin
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

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Edit Question
            </h1>
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={() => void handleSaveEdit()}
                    disabled={!hasChanges || editedText.trim() === ""}
                    className="px-4 py-2 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/30 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <SaveIcon className="w-4 h-4" />
                    Save Changes
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
                  >
                    <XIcon className="w-4 h-4" />
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={handleStartEdit}
                  className="px-4 py-2 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/30 transition-colors"
                >
                  Edit Question
                </button>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {/* Question Text */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Question Text
              </label>
              {isEditing ? (
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={4}
                  placeholder="Enter question text"
                />
              ) : (
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                  <p className="text-gray-900 dark:text-white">{question.text}</p>
                </div>
              )}
            </div>

            {/* Style */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Style
              </label>
              {isEditing ? (
                <select
                  value={editedStyle}
                  onChange={(e) => setEditedStyle(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">No style</option>
                  {styles?.map((style) => (
                    <option key={style.id} value={style.id}>
                      {style.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                  <span className="text-gray-900 dark:text-white">{styleName}</span>
                </div>
              )}
            </div>

            {/* Tone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tone
              </label>
              {isEditing ? (
                <select
                  value={editedTone}
                  onChange={(e) => setEditedTone(e.target.value)}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">No tone</option>
                  {tones?.map((tone) => (
                    <option key={tone.id} value={tone.id}>
                      {tone.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                  <span className="text-gray-900 dark:text-white">{toneName}</span>
                </div>
              )}
            </div>

            {/* Question Stats */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Question Statistics</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Total Likes:</span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-white">{question.totalLikes}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Total Shows:</span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-white">{question.totalShows}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Created:</span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-white">
                    {new Date(question._creationTime).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">ID:</span>
                  <span className="ml-2 font-mono text-xs text-gray-500 dark:text-gray-400">{question._id}</span>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="border-t border-gray-200 dark:border-gray-600 pt-6">
              <h3 className="text-lg font-medium text-red-600 dark:text-red-400 mb-4">Danger Zone</h3>
              <button
                onClick={() => void handleDeleteQuestion()}
                className="px-4 py-2 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors"
              >
                Delete Question
              </button>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                This action cannot be undone. The question will be permanently deleted.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default IndividualQuestionPage;
