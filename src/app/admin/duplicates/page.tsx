import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, Authenticated, Unauthenticated, AuthLoading, useAction } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { HouseIcon, ArrowLeftIcon, CheckIcon, XIcon, TrashIcon, EditIcon, SaveIcon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

const DuplicateDetectionPage: React.FC = () => {
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
  return <DuplicateDetectionComponent />;
}

function DuplicateDetectionComponent() {
  const user = useUser();
  const { theme, setTheme } = useTheme();
  const [selectedQuestions, setSelectedQuestions] = useState<Id<"questions">[]>([]);
  const [keepQuestion, setKeepQuestion] = useState<Id<"questions"> | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Id<"questions"> | null>(null);
  const [editedText, setEditedText] = useState<string>("");
  const [rejectReason, setRejectReason] = useState<string>("");
  const [isDetectingDuplicates, setIsDetectingDuplicates] = useState<boolean>(false);
  const [currentDetection, setCurrentDetection] = useState<Id<"duplicateDetections"> | null>(null);

  const duplicateDetections = useQuery(api.questions.getPendingDuplicateDetections);
  const updateStatus = useMutation(api.questions.updateDuplicateDetectionStatus);
  const deleteDuplicates = useMutation(api.questions.deleteDuplicateQuestions);
  const updateQuestion = useMutation(api.questions.updateQuestion);
  const detectDuplicatesStreaming = useAction(api.ai.detectDuplicateQuestionsStreaming);
  
  const duplicateDetectionProgress = useQuery(api.duplicates.getLatestDuplicateDetectionProgress);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  // Monitor progress updates
  useEffect(() => {
    if (duplicateDetectionProgress && duplicateDetectionProgress.status !== 'running') {
      setIsDetectingDuplicates(false);
      if (duplicateDetectionProgress.status === 'completed') {
        console.log('Duplicate detection completed:', duplicateDetectionProgress);
        // No need to reload - React will automatically update the UI when the query data changes
      } else if (duplicateDetectionProgress.status === 'failed') {
        console.error('Duplicate detection failed:', duplicateDetectionProgress.errors);
      }
    }
  }, [duplicateDetectionProgress]);

  const handleDeleteAll = async (detection: any) => {
    try {
      if (!window.confirm('Are you sure you want to delete all duplicates?')) {
        return;
      }
      await deleteDuplicates({
        detectionId: detection._id,
        questionIdsToDelete: detection.questionIds,
      });
      //clear selected
      setSelectedQuestions([]);
      setKeepQuestion(null);
    } catch (error) {
      console.error('Error deleting all duplicates:', error);
      alert('Error deleting all duplicates');
    }
  };
  const handleApprove = async (detectionId: Id<"duplicateDetections">) => {
    if (!keepQuestion || selectedQuestions.length === 0) {
      alert('Please select which questions to keep and delete');
      return;
    }

    try {
      await deleteDuplicates({
        detectionId,
        questionIdsToDelete: selectedQuestions,
        keepQuestionId: keepQuestion,
      });

      // Reset selections
      setSelectedQuestions([]);
      setKeepQuestion(null);
    } catch (error) {
      console.error('Error deleting duplicates:', error);
      alert('Error deleting duplicates');
    }
  };

  const handleReject = async (detectionId: Id<"duplicateDetections">) => {
    try {
      await updateStatus({
        detectionId,
        status: "rejected",
        reviewerEmail: user.user?.primaryEmailAddress?.emailAddress,
        rejectReason: rejectReason.trim(),
      });
      setRejectReason("");
    } catch (error) {
      console.error('Error rejecting detection:', error);
      alert('Error rejecting detection');
    }
  };

  const toggleQuestionSelection = (questionId: Id<"questions">) => {
    setSelectedQuestions(prev => {
      if (prev.includes(questionId)) {
        return prev.filter(id => id !== questionId);
      } else {
        return [...prev, questionId];
      }
    });
  };

  const handleDetectDuplicates = async () => {
    try {
      setIsDetectingDuplicates(true);
      const progressId = await detectDuplicatesStreaming();
      console.log('Started duplicate detection with progress ID:', progressId);
    } catch (error) {
      console.error('Error starting duplicate detection:', error);
      setIsDetectingDuplicates(false);
    }
  };

  const handleStartEdit = (questionId: Id<"questions">, currentText: string) => {
    setEditingQuestion(questionId);
    setEditedText(currentText);
  };

  const handleCancelEdit = () => {
    setEditingQuestion(null);
    setEditedText("");
  };

  const handleSaveEdit = async (questionId: Id<"questions">) => {
    if (editedText.trim() === "") {
      alert("Question text cannot be empty");
      return;
    }

    try {
      await updateQuestion({
        id: questionId,
        text: editedText.trim(),
      });
      setEditingQuestion(null);
      setEditedText("");
    } catch (error) {
      console.error('Error updating question:', error);
      alert('Error updating question');
    }
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

        <div className="mb-6 flex flex-col justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Duplicate Detection Review</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Review AI-detected duplicate questions. Select which questions to keep and which to delete.
            </p>
          </div>
          <Link to="/admin/duplicates/completed" className="px-4 py-2 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/30 transition-colors">
            View Completed Reviews
          </Link>
        </div>

        {/* Progress Display */}
        {isDetectingDuplicates && duplicateDetectionProgress && (
          <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                Detecting Duplicates...
              </h3>
              <span className="text-sm text-blue-700 dark:text-blue-300">
                {duplicateDetectionProgress.currentBatch} / {duplicateDetectionProgress.totalBatches} batches
              </span>
            </div>
            <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mb-2">
              <div 
                className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                style={{ 
                  width: `${(duplicateDetectionProgress.processedQuestions / duplicateDetectionProgress.totalQuestions) * 100}%` 
                }}
              ></div>
            </div>
            <div className="flex justify-between text-sm text-blue-700 dark:text-blue-300">
              <span>
                {duplicateDetectionProgress.processedQuestions} / {duplicateDetectionProgress.totalQuestions} questions processed
              </span>
              <span>
                {duplicateDetectionProgress.duplicatesFound} duplicates found
              </span>
            </div>
            {duplicateDetectionProgress.errors.length > 0 && (
              <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                <strong>Errors:</strong>
                <ul className="list-disc list-inside ml-2">
                  {duplicateDetectionProgress.errors.map((error: string, index: number) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {duplicateDetections.length === 0 ? (
          <div className="flex flex-col gap-4 items-center justify-center text-center py-12">
            <div className="text-gray-500 dark:text-gray-400 text-lg">
              No pending duplicate detections found.
            </div>
            <p className="text-gray-400 dark:text-gray-500 mt-2">
              The AI will automatically detect duplicates daily.
            </p>
            <button
              onClick={() => void handleDetectDuplicates()}
              disabled={isDetectingDuplicates}
              className="px-4 py-2 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/30 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDetectingDuplicates ? 'Detecting Duplicates...' : 'Detect Duplicates Now'}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {duplicateDetections.map((detection: any) => (
              <div 
                key={detection._id} 
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6"
                onMouseOver={() => setCurrentDetection(detection._id)}
                onMouseLeave={() => setCurrentDetection(null)}
              >
                <div className="flex flex-col gap-4 justify-between items-start mb-4">
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

                  <div className="w-full space-y-3">
                    {detection.questions.map((question: any) => (
                      <div
                        key={question._id}
                        className={`p-4 rounded-lg border-2 transition-colors cursor-pointer ${keepQuestion === question._id
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : selectedQuestions.includes(question._id)
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                          }`}
                        onClick={() => {
                          if (keepQuestion === question._id) {
                            setKeepQuestion(null);
                            setSelectedQuestions([]);
                          } else {
                            setKeepQuestion(question._id);
                            const otherQuestionIds = detection.questions
                              .map((q: any) => q._id)
                              .filter((id: Id<"questions">) => id !== question._id);
                            setSelectedQuestions(otherQuestionIds);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            {editingQuestion === question._id ? (
                              <div className="mb-2">
                                <textarea
                                  value={editedText}
                                  onChange={(e) => setEditedText(e.target.value)}
                                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  rows={3}
                                  autoFocus
                                />
                                <div className="flex gap-2 mt-2">
                                  <button
                                    onClick={() => void handleSaveEdit(question._id)}
                                    className="px-3 py-1 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded text-sm hover:bg-green-200 dark:hover:bg-green-900/30 transition-colors flex items-center gap-1"
                                  >
                                    <SaveIcon className="w-3 h-3" />
                                    Save
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1"
                                  >
                                    <XIcon className="w-3 h-3" />
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between">
                                <p className="text-gray-900 dark:text-white font-medium mb-2 flex-1">
                                  <Link to={`/admin/questions/${question._id}`} className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors">{question.text}</Link>
                                </p>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartEdit(question._id, question.text);
                                  }}
                                  className="ml-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                  title="Edit question text"
                                >
                                  <EditIcon className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                            <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400">
                              <span>Likes: {question.totalLikes}</span>
                              <span>Shows: {question.totalShows}</span>
                              {question.style && <span>Style: {question.style}</span>}
                              {question.tone && <span>Tone: {question.tone}</span>}
                            </div>
                          </div>
                          <div className="ml-4">
                            {keepQuestion === question._id ? (
                              <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                <CheckIcon className="w-4 h-4" />
                                <span className="text-sm font-medium">Keep</span>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleQuestionSelection(question._id);
                                }}
                                className={`p-2 rounded-lg transition-colors ${selectedQuestions.includes(question._id)
                                  ? 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-red-100 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400'
                                  }`}
                                title={selectedQuestions.includes(question._id) ? 'Remove from deletion' : 'Mark for deletion'}
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {currentDetection == detection._id && <div className="flex flex-col gap-2 w-full">
                    {keepQuestion && selectedQuestions.length > 0 && (
                      <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">
                          <strong>Action:</strong> Keep 1 question, delete {selectedQuestions.length} question(s)
                        </p>
                      </div>
                    )}
                    {!keepQuestion && selectedQuestions.length === 0 && (
                      <div className="w-full mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <textarea
                          value={rejectReason}
                          placeholder="Enter reason for rejection"
                          onChange={(e) => setRejectReason(e.target.value)}
                          className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          rows={3}
                        />
                      </div>
                    )}

                    <div className="flex gap-2">
                      {!keepQuestion && !selectedQuestions.length && <button
                        onClick={() => void handleReject(detection._id)}
                        className="px-4 py-2 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors flex items-center gap-2"
                      >
                        <XIcon className="w-4 h-4" />
                        Reject
                      </button>}
                      {keepQuestion && selectedQuestions.length > 0 && <button
                        onClick={() => void handleApprove(detection._id)}
                        className="px-4 py-2 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/30 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CheckIcon className="w-4 h-4" />
                        Approve & Delete
                      </button>}
                      <button
                        onClick={() => void handleDeleteAll(detection)}
                        className="px-4 py-2 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors flex items-center gap-2"
                      >
                        <XIcon className="w-4 h-4" />
                        Delete All
                      </button>
                    </div>
                  </div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DuplicateDetectionPage;
