import React, { useState } from 'react';
import { useQuery, useMutation, Authenticated, Unauthenticated, AuthLoading } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Doc, Id } from '../../../../convex/_generated/dataModel';
import { SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { useTheme } from '../../../hooks/useTheme';
import { Link } from 'react-router-dom';
import { HouseIcon } from '@/components/ui/icons/icons';
import { ColorPicker } from '@/components/ui/color-picker';

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
  const user = useUser();
  if (!user.isSignedIn) {
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
  const [newToneOrder, setNewToneOrder] = useState('');
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
        order: newToneOrder ? parseFloat(newToneOrder) : undefined,
      });
      setNewToneId('');
      setNewToneName('');
      setNewToneDescription('');
      setNewTonePromptGuidance('');
      setNewToneColor('');
      setNewToneIcon('');
      setNewToneOrder('');
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
        order: editingTone.order,
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-2 sm:p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <Link to="/admin" className="text-gray-500 flex items-center gap-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors text-sm sm:text-base">
            <HouseIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            Admin
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
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
            <div className="p-1 sm:p-2">
              <UserButton />
            </div>
          </div>
        </div>
        <div className="mb-6 sm:mb-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-4 sm:mb-6">Create New Tone</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tone ID</label>
              <input
                type="text"
                value={newToneId}
                onChange={(e) => setNewToneId(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter tone id"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tone Name</label>
              <input
                type="text"
                value={newToneName}
                onChange={(e) => setNewToneName(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter tone name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Color</label>
              <ColorPicker
                color={newToneColor}
                onChange={setNewToneColor}
                className="w-10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Icon</label>
              <input
                type="text"
                value={newToneIcon}
                onChange={(e) => setNewToneIcon(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter tone icon"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Order</label>
              <input
                type="number"
                value={newToneOrder}
                onChange={(e) => setNewToneOrder(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter order"
              />
            </div>
          </div>
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
              <textarea
                value={newToneDescription}
                onChange={(e) => setNewToneDescription(e.target.value)}
                rows={3}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter tone description"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prompt Guidance</label>
              <textarea
                value={newTonePromptGuidance}
                onChange={(e) => setNewTonePromptGuidance(e.target.value)}
                rows={3}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter tone prompt guidance"
              />
            </div>
          </div>
          <button
            onClick={handleCreateTone}
            className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition-colors text-base"
          >
            Create Tone
          </button>
        </div>
        <div className="mb-6 sm:mb-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Search tones..."
            />
            <button
              onClick={() => setSearchText('')}
              className="w-full sm:w-auto bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-colors text-base"
            >
              Clear
            </button>
          </div>
        </div>
        {/* Desktop Table View */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Name</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Description</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Prompt Guidance</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Color</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Icon</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Order</th>
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
                      <textarea
                        rows={3}
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
                      <textarea
                        rows={3}
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
                      <ColorPicker
                        color={editingTone.color}
                        onChange={(color) => setEditingTone({ ...editingTone, color })}
                        className="w-10"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded border border-gray-200 dark:border-gray-700" style={{ backgroundColor: tone.color }}></div>
                        <span className="text-gray-600 dark:text-gray-400">{tone.color}</span>
                      </div>
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
                    {editingTone?._id === tone._id ? (
                      <input
                        type="number"
                        value={editingTone.order ?? ''}
                        onChange={(e) => setEditingTone({ ...editingTone, order: e.target.value ? parseFloat(e.target.value) : undefined })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">{tone.order}</span>
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

        {/* Mobile Card View */}
        <div className="lg:hidden space-y-4">
          {tones?.filter(tone => {
            const searchLower = searchText.toLowerCase();
            return tone.name.toLowerCase().includes(searchLower) ||
              (tone.description && tone.description.toLowerCase().includes(searchLower))
          }).map((tone) => (
            <div key={tone._id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
                  {editingTone?._id === tone._id ? (
                    <input
                      type="text"
                      value={editingTone.name}
                      onChange={(e) => setEditingTone({ ...editingTone, name: e.target.value })}
                      className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <span className="text-gray-900 dark:text-white text-base">{tone.name}</span>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
                  {editingTone?._id === tone._id ? (
                    <textarea
                      rows={3}
                      value={editingTone.description ?? ''}
                      onChange={(e) => setEditingTone({ ...editingTone, description: e.target.value })}
                      className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <span className="text-gray-600 dark:text-gray-400 text-sm">{tone.description}</span>
                  )}
                </div>

                {/* Color and Icon */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Color</label>
                    {editingTone?._id === tone._id ? (
                      <ColorPicker
                        color={editingTone.color}
                        onChange={(color) => setEditingTone({ ...editingTone, color })}
                        className="w-10"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded border border-gray-200 dark:border-gray-700" style={{ backgroundColor: tone.color }}></div>
                        <span className="text-gray-600 dark:text-gray-400 text-sm">{tone.color}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Icon</label>
                    {editingTone?._id === tone._id ? (
                      <input
                        type="text"
                        value={editingTone.icon}
                        onChange={(e) => setEditingTone({ ...editingTone, icon: e.target.value })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400 text-sm">{tone.icon}</span>
                    )}
                  </div>
                </div>

                {/* Prompt Guidance */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prompt Guidance</label>
                  {editingTone?._id === tone._id ? (
                    <textarea
                      rows={3}
                      value={editingTone.promptGuidanceForAI}
                      onChange={(e) => setEditingTone({ ...editingTone, promptGuidanceForAI: e.target.value })}
                      className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <span className="text-gray-600 dark:text-gray-400 text-sm">{tone.promptGuidanceForAI}</span>
                  )}
                </div>

                {/* Order */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Order</label>
                  {editingTone?._id === tone._id ? (
                    <input
                      type="number"
                      value={editingTone.order ?? ''}
                      onChange={(e) => setEditingTone({ ...editingTone, order: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <span className="text-gray-600 dark:text-gray-400 text-sm">{tone.order}</span>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row gap-3">
                    {editingTone?._id === tone._id ? (
                      <>
                        <button 
                          onClick={handleUpdateTone} 
                          className="flex-1 bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-lg font-medium transition-colors text-base"
                        >
                          Save Changes
                        </button>
                        <button 
                          onClick={() => setEditingTone(null)} 
                          className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-4 py-3 rounded-lg font-medium transition-colors text-base"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button 
                        onClick={() => setEditingTone(tone)} 
                        className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-3 rounded-lg font-medium transition-colors text-base"
                      >
                        Edit Tone
                      </button>
                    )}
                    <button 
                      onClick={() => handleDeleteTone(tone._id)} 
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-lg font-medium transition-colors text-base"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TonesPage;
