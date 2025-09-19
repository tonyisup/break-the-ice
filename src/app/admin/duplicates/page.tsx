import React, { useState } from 'react';
import { useQuery, useMutation, Authenticated, Unauthenticated, AuthLoading, useAction } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Doc, Id } from '../../../../convex/_generated/dataModel';
import { SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { useTheme } from '../../../hooks/useTheme';
import { Link } from 'react-router-dom';
import { HouseIcon, ArrowLeftIcon, CheckIcon, XIcon, TrashIcon } from 'lucide-react';

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
  const [selectedQuestions, setSelectedQuestions] = useState<Id<"questions">[]>([]);
  const [keepQuestion, setKeepQuestion] = useState<Id<"questions"> | null>(null);

  const duplicateDetections = useQuery(api.questions.getPendingDuplicateDetections);
  const updateStatus = useMutation(api.questions.updateDuplicateDetectionStatus);
  const deleteDuplicates = useMutation(api.questions.deleteDuplicateQuestions);
  const detectDuplicates = useAction(api.ai.detectDuplicateQuestions);
  
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
        reviewerId: "system" as Id<"users">, // You might want to get the actual user ID
      });
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
    const result = await detectDuplicates();
    console.log(result);
  };

  if (!duplicateDetections) {
    return <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
      <div className="text-gray-600 dark:text-gray-400">Loading...</div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link to="/admin" className="text-gray-500 flex items-center gap-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Admin
          </Link>
          <Link to="/" className="text-gray-500 flex items-center gap-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors text-sm sm:text-base">
            <HouseIcon />
            Home
          </Link>
          <div className="ml-auto">
            <UserButton />
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Duplicate Detection Review</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Review AI-detected duplicate questions. Select which questions to keep and which to delete.
          </p>
        </div>

        {duplicateDetections.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 dark:text-gray-400 text-lg">
              No pending duplicate detections found.
            </div>
            <p className="text-gray-400 dark:text-gray-500 mt-2">
              The AI will automatically detect duplicates daily.
            </p>
            <button
              onClick={() => void handleDetectDuplicates()}
              className="px-4 py-2 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/30 transition-colors flex items-center gap-2"
            >
              Detect Duplicates Now
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {duplicateDetections.map((detection: any) => (
              <div key={detection._id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
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

                <div className="space-y-3">
                  {detection.questions.map((question: any) => (
                    <div
                      key={question._id}
                      className={`p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                        keepQuestion === question._id
                          ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                          : selectedQuestions.includes(question._id)
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                      onClick={() => {
                        if (keepQuestion === question._id) {
                          setKeepQuestion(null);
                        } else {
                          setKeepQuestion(question._id);
                          // Remove from selected questions if it was there
                          setSelectedQuestions(prev => prev.filter(id => id !== question._id));
                        }
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-gray-900 dark:text-white font-medium mb-2">
                            {question.text}
                          </p>
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
                              className={`p-2 rounded-lg transition-colors ${
                                selectedQuestions.includes(question._id)
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

                {keepQuestion && selectedQuestions.length > 0 && (
                  <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      <strong>Action:</strong> Keep 1 question, delete {selectedQuestions.length} question(s)
                    </p>
                  </div>
                )}
                
                <div className="flex gap-2">
                    <button
                      onClick={() => void handleReject(detection._id)}
                      className="px-4 py-2 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors flex items-center gap-2"
                    >
                      <XIcon className="w-4 h-4" /> 
                      Reject
                    </button>
                    <button
                      onClick={() => void handleApprove(detection._id)}
                      disabled={!keepQuestion || selectedQuestions.length === 0}
                      className="px-4 py-2 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/30 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckIcon className="w-4 h-4" />
                      Approve & Delete
                    </button>
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

export default DuplicateDetectionPage;
