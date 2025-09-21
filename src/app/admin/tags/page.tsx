import React, { useState } from 'react';
import { useQuery, useMutation, Authenticated, Unauthenticated, AuthLoading } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Doc, Id } from '../../../../convex/_generated/dataModel';
import { SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { useTheme } from '../../../hooks/useTheme';
import { Link } from 'react-router-dom';
import { HouseIcon } from '@/components/ui/icons/icons';

const TagsPage: React.FC = () => {
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
  return <TagManager />;
}

function TagManager() {
  const tags = useQuery(api.tags.getTags);
  const createTag = useMutation(api.tags.createTag);
  const updateTag = useMutation(api.tags.updateTag);
  const deleteTag = useMutation(api.tags.deleteTag);
  const { theme, setTheme } = useTheme();

  const [newTagName, setNewTagName] = useState('');
  const [newTagGrouping, setNewTagGrouping] = useState('');
  const [newTagDescription, setNewTagDescription] = useState('');
  const [editingTag, setEditingTag] = useState<Doc<"tags"> | null>(null);
  const [searchText, setSearchText] = useState('');

  const handleCreateTag = () => {
    if (newTagName.trim() && newTagGrouping.trim()) {
      void createTag({
        name: newTagName,
        grouping: newTagGrouping,
        description: newTagDescription,
      });
      setNewTagName('');
      setNewTagGrouping('');
      setNewTagDescription('');
    }
  };

  const handleUpdateTag = () => {
    if (editingTag && editingTag.name.trim() && editingTag.grouping.trim()) {
      void updateTag({
        id: editingTag._id,
        name: editingTag.name,
        grouping: editingTag.grouping,
        description: editingTag.description,
      });
      setEditingTag(null);
    }
  };

  const handleDeleteTag = (id: Id<"tags">) => {
    void deleteTag({ id });
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
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter new tag name"
            />
            <input
              type="text"
              value={newTagGrouping}
              onChange={(e) => setNewTagGrouping(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter new tag grouping"
            />
            <input
              type="text"
              value={newTagDescription}
              onChange={(e) => setNewTagDescription(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter tag description (optional)"
            />
            <button
              onClick={handleCreateTag}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Create Tag
            </button>
          </div>
        </div>
        <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 flex gap-3">
            <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Search tags..."
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
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white w-1/4">Name</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white w-1/4">Grouping</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white w-1/2">Description</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white w-1/4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {tags?.filter(tag => {
                const searchLower = searchText.toLowerCase();
                return tag.name.toLowerCase().includes(searchLower) ||
                  (tag.grouping && tag.grouping.toLowerCase().includes(searchLower)) ||
                  (tag.description && tag.description.toLowerCase().includes(searchLower))
              }).map((tag) => (
                <tr key={tag._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="p-4 align-top">
                    {editingTag?._id === tag._id ? (
                      <input
                        type="text"
                        value={editingTag.name}
                        onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <span className="text-gray-900 dark:text-white">{tag.name}</span>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    {editingTag?._id === tag._id ? (
                      <input
                        type="text"
                        value={editingTag.grouping}
                        onChange={(e) => setEditingTag({ ...editingTag, grouping: e.target.value })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">
                        {tag.grouping}
                      </span>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    {editingTag?._id === tag._id ? (
                      <input
                        type="text"
                        value={editingTag.description ?? ''}
                        onChange={(e) => setEditingTag({ ...editingTag, description: e.target.value })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">{tag.description}</span>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    <div className="flex gap-2">
                      {editingTag?._id === tag._id ? (
                        <div className="flex gap-2">
                          <button onClick={handleUpdateTag} className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Save</button>
                          <button onClick={() => setEditingTag(null)} className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setEditingTag(tag)} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Edit</button>
                      )}
                      <button onClick={() => handleDeleteTag(tag._id)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Delete</button>
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

export default TagsPage;
