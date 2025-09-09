import React, { useState } from 'react';
import { useQuery, useMutation, Authenticated, Unauthenticated, AuthLoading } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Doc, Id } from '../../../../convex/_generated/dataModel';
import { SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { useTheme } from '../../../hooks/useTheme';
import { Link } from 'react-router-dom';
import { HouseIcon } from 'lucide-react';

const TonesPage: React.FC = () => {
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
  return <ToneManager />;
}

function ToneManager() {
  const tones = useQuery(api.tones.getTones);
  const createTone = useMutation(api.tones.createTone);
  const updateTone = useMutation(api.tones.updateTone);
  const deleteTone = useMutation(api.tones.deleteTone);
  const { theme, setTheme } = useTheme();

  const [newToneId, setNewToneId] = useState('');
  const [newToneName, setNewToneName] = useState('');
  const [newToneDescription, setNewToneDescription] = useState('');
  const [newTonePromptGuidance, setNewTonePromptGuidance] = useState('');
  const [newToneColor, setNewToneColor] = useState('');
  const [newToneIcon, setNewToneIcon] = useState('');
  const [editingTone, setEditingTone] = useState<Doc<"tones"> | null>(null);
  const [searchText, setSearchText] = useState('');

  const handleCreateTone = () => {
    if (newToneName.trim()) {
      void createTone({
        id: newToneId,
        name: newToneName,
        description: newToneDescription,
        promptGuidanceForAI: newTonePromptGuidance,
        color: newToneColor,
        icon: newToneIcon,
      });
      setNewToneId('');
      setNewToneName('');
      setNewToneDescription('');
      setNewTonePromptGuidance('');
      setNewToneColor('');
      setNewToneIcon('');
    }
  };

  const handleUpdateTone = () => {
    if (editingTone && editingTone.name.trim()) {
      void updateTone({
        _id: editingTone._id,
        id: editingTone.id,
        name: editingTone.name,
        description: editingTone.description,
        promptGuidanceForAI: editingTone.promptGuidanceForAI,
        color: editingTone.color,
        icon: editingTone.icon,
      });
      setEditingTone(null);
    }
  };

  const handleDeleteTone = (id: Id<"tones">) => {
    void deleteTone({ id });
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <Link to="/admin" className="text-gray-500 flex items-center gap-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors text-sm sm:text-base">
            <HouseIcon />
            Admin
          </Link>
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
          <div className="space-y-4 mb-6">
            <input
              type="text"
              value={newToneId}
              onChange={(e) => setNewToneId(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter new tone id"
            />
            <input
              type="text"
              value={newToneName}
              onChange={(e) => setNewToneName(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter new tone name"
            />
            <input
              type="text"
              value={newToneDescription}
              onChange={(e) => setNewToneDescription(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter tone description"
            />
            <input
              type="text"
              value={newTonePromptGuidance}
              onChange={(e) => setNewTonePromptGuidance(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter tone prompt guidance"
            />
            <input
              type="text"
              value={newToneColor}
              onChange={(e) => setNewToneColor(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter tone color"
            />
            <input
              type="text"
              value={newToneIcon}
              onChange={(e) => setNewToneIcon(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter tone icon"
            />
            <button
              onClick={handleCreateTone}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Create Tone
            </button>
          </div>
        </div>
        <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex gap-3">
            <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Search tones..."
            />
            <button
                onClick={() => setSearchText('')}
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
                Clear
            </button>
        </div>
        <div className=" overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Name</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Description</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Prompt Guidance</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Color</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Icon</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {tones?.filter(tone => {
                const searchLower = searchText.toLowerCase();
                return tone.name.toLowerCase().includes(searchLower) ||
                  (tone.description && tone.description.toLowerCase().includes(searchLower))
              }).map((tone) => (
                <tr key={tone._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="p-4 align-top">
                    {editingTone?._id === tone._id ? (
                      <input
                        type="text"
                        value={editingTone.name}
                        onChange={(e) => setEditingTone({ ...editingTone, name: e.target.value })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <span className="text-gray-900 dark:text-white">{tone.name}</span>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    {editingTone?._id === tone._id ? (
                      <input
                        type="text"
                        value={editingTone.description ?? ''}
                        onChange={(e) => setEditingTone({ ...editingTone, description: e.target.value })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">{tone.description}</span>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    {editingTone?._id === tone._id ? (
                      <input
                        type="text"
                        value={editingTone.promptGuidanceForAI}
                        onChange={(e) => setEditingTone({ ...editingTone, promptGuidanceForAI: e.target.value })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">{tone.promptGuidanceForAI}</span>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    {editingTone?._id === tone._id ? (
                      <input
                        type="text"
                        value={editingTone.color}
                        onChange={(e) => setEditingTone({ ...editingTone, color: e.target.value })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">{tone.color}</span>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    {editingTone?._id === tone._id ? (
                      <input
                        type="text"
                        value={editingTone.icon}
                        onChange={(e) => setEditingTone({ ...editingTone, icon: e.target.value })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">{tone.icon}</span>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    <div className="flex gap-2">
                      {editingTone?._id === tone._id ? (
                        <div className="flex gap-2">
                          <button onClick={handleUpdateTone} className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Save</button>
                          <button onClick={() => setEditingTone(null)} className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setEditingTone(tone)} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Edit</button>
                      )}
                      <button onClick={() => handleDeleteTone(tone._id)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default TonesPage;
