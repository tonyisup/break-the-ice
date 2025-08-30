import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Doc } from '../../../convex/_generated/dataModel';

const AdminPage: React.FC = () => {
  const questions = useQuery(api.questions.getQuestions);
  const createQuestion = useMutation(api.questions.createQuestion);
  const updateQuestion = useMutation(api.questions.updateQuestion);
  const deleteQuestion = useMutation(api.questions.deleteQuestion);

  const [newQuestionText, setNewQuestionText] = useState('');
  const [editingQuestion, setEditingQuestion] = useState<Doc<"questions"> | null>(null);

  const handleCreateQuestion = async () => {
    if (newQuestionText.trim()) {
      await createQuestion({ text: newQuestionText });
      setNewQuestionText('');
    }
  };

  const handleUpdateQuestion = async () => {
    if (editingQuestion && editingQuestion.text.trim()) {
      await updateQuestion({ id: editingQuestion._id, text: editingQuestion.text });
      setEditingQuestion(null);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    await deleteQuestion({ id });
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Admin Portal</h1>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Create New Question</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newQuestionText}
            onChange={(e) => setNewQuestionText(e.target.value)}
            className="border p-2 rounded-lg flex-grow"
            placeholder="Enter new question text"
          />
          <button onClick={handleCreateQuestion} className="bg-blue-500 text-white p-2 rounded-lg">
            Create
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">Manage Questions</h2>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Question</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {questions?.map((q) => (
              <tr key={q._id} className="border-b">
                <td className="p-2">
                  {editingQuestion?._id === q._id ? (
                    <input
                      type="text"
                      value={editingQuestion.text}
                      onChange={(e) => setEditingQuestion({ ...editingQuestion, text: e.target.value })}
                      className="border p-1 rounded-lg w-full"
                    />
                  ) : (
                    q.text
                  )}
                </td>
                <td className="p-2 flex gap-2">
                  {editingQuestion?._id === q._id ? (
                    <button onClick={handleUpdateQuestion} className="bg-green-500 text-white p-1 rounded-lg">
                      Save
                    </button>
                  ) : (
                    <button onClick={() => setEditingQuestion(q)} className="bg-yellow-500 text-white p-1 rounded-lg">
                      Edit
                    </button>
                  )}
                  <button onClick={() => handleDeleteQuestion(q._id)} className="bg-red-500 text-white p-1 rounded-lg">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminPage;
