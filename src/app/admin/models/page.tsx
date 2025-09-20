import React, { useState } from 'react';
import { useQuery, useMutation, Authenticated, Unauthenticated, AuthLoading } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Doc, Id } from '../../../../convex/_generated/dataModel';
import { SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { useTheme } from '../../../hooks/useTheme';
import { Link } from 'react-router-dom';
import { HouseIcon } from '@/components/ui/icons/icons';

const ModelsPage: React.FC = () => {
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
    return <ModelManager />;
  }

function ModelManager() {
    const models = useQuery(api.models.getModels);
    const createModel = useMutation(api.models.createModel);
    const updateModel = useMutation(api.models.updateModel);
    const deleteModel = useMutation(api.models.deleteModel);
    const { theme, setTheme } = useTheme();

    const [newModelId, setNewModelId] = useState('');
    const [newModelName, setNewModelName] = useState('');
    const [newModelDescription, setNewModelDescription] = useState('');
    const [newModelNsfw, setNewModelNsfw] = useState(false);
    const [editingModel, setEditingModel] = useState<Doc<"models"> | null>(null);
    const [searchText, setSearchText] = useState('');

    const toggleTheme = () => {
      setTheme(theme === 'light' ? 'dark' : 'light');
    };

    const handleCreateModel = () => {
      if (newModelId.trim() && newModelName.trim()) {
        void createModel({
          id: newModelId,
          name: newModelName,
          description: newModelDescription,
          nsfw: newModelNsfw
        });
        setNewModelId('');
        setNewModelName('');
        setNewModelDescription('');
        setNewModelNsfw(false);
      }
    };

    const handleUpdateModel = () => {
      if (editingModel && editingModel.name.trim()) {
        void updateModel({
          id: editingModel._id,
          name: editingModel.name,
          description: editingModel.description,
          nsfw: editingModel.nsfw
        });
        setEditingModel(null);
      }
    };

    const handleDeleteModel = (id: Id<"models">) => {
      void deleteModel({ id });
    };

    const clearSearchText = () => {
      setSearchText('');
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
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Create New Model</h2>
            <div className="space-y-4">
              <input
                type="text"
                value={newModelId}
                onChange={(e) => setNewModelId(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter new model id"
              />
              <input
                type="text"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter new model name"
              />
              <input
                type="text"
                value={newModelDescription}
                onChange={(e) => setNewModelDescription(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter new model description"
              />
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={newModelNsfw}
                  onChange={(e) => setNewModelNsfw(e.target.checked)}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="nsfw" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">NSFW</label>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleCreateModel}
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
              placeholder="Search models..."
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
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Manage Models</h2>
            </div>
            {/* Mobile View */}
            <div className="md:hidden">
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {models?.filter(m => m.name.toLowerCase().includes(searchText.toLowerCase()))?.map((m) => (
                  <div key={m._id} className="p-4 space-y-3">
                    {editingModel?._id === m._id ? (
                      <div className="space-y-3">
                        <input
                          value={editingModel.id}
                          onChange={(e) => setEditingModel({ ...editingModel, id: e.target.value })}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <input
                          value={editingModel.name}
                          onChange={(e) => setEditingModel({ ...editingModel, name: e.target.value })}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <textarea
                          value={editingModel.description ?? ''}
                          onChange={(e) => setEditingModel({ ...editingModel, description: e.target.value })}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          rows={3}
                        />
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={editingModel.nsfw}
                            onChange={(e) => setEditingModel({ ...editingModel, nsfw: e.target.checked })}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="nsfw" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">NSFW</label>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleUpdateModel} className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1">Save</button>
                          <button onClick={() => setEditingModel(null)} className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-gray-900 dark:text-white">{m.name}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{m.description || 'No description'}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{m.nsfw ? 'NSFW' : 'SFW'}</p>
                        <div className="flex gap-2 pt-2">
                          <button onClick={() => setEditingModel(m)} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Edit</button>
                          <button onClick={() => handleDeleteModel(m._id)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Delete</button>
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
                    <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white w-1/4">Name</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white w-1/2">Description</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white w-1/8">NSFW</th>
                    <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white w-1/8">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {models?.map((m) => (
                    <tr key={m._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <td className="p-4 align-top">
                        {editingModel?._id === m._id ? (
                          <input
                            value={editingModel.name}
                            onChange={(e) => setEditingModel({ ...editingModel, name: e.target.value })}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        ) : (
                          <span className="text-gray-900 dark:text-white">{m.name}</span>
                        )}
                      </td>
                      <td className="p-4 align-top">
                        {editingModel?._id === m._id ? (
                          <textarea
                            value={editingModel.description ?? ''}
                            onChange={(e) => setEditingModel({ ...editingModel, description: e.target.value })}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            rows={2}
                          />
                        ) : (
                          <span className="text-gray-600 dark:text-gray-400">
                            {m.description || <em>No description</em>}
                          </span>
                        )}
                      </td>
                      <td className="p-4 align-top">
                        {editingModel?._id === m._id ? (
                          <input
                            type="checkbox"
                            checked={editingModel.nsfw}
                            onChange={(e) => setEditingModel({ ...editingModel, nsfw: e.target.checked })}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                        ) : (
                          <span className="text-gray-600 dark:text-gray-400">{m.nsfw ? 'Yes' : 'No'}</span>
                        )}
                      </td>
                      <td className="p-4 align-top">
                        <div className="flex gap-2">
                          {editingModel?._id === m._id ? (
                            <div className="flex gap-2">
                              <button onClick={handleUpdateModel} className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Save</button>
                              <button onClick={() => setEditingModel(null)} className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setEditingModel(m)} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Edit</button>
                          )}
                          <button onClick={() => handleDeleteModel(m._id)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Delete</button>
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
}

export default ModelsPage;
