import React, { useState } from 'react';
import { useQuery, useMutation, Authenticated, Unauthenticated, AuthLoading } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Doc, Id } from '../../../../convex/_generated/dataModel';
import { SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { useTheme } from '../../../hooks/useTheme';
import { Link } from 'react-router-dom';
import { HouseIcon, iconMap } from '@/components/ui/icons/icons';
import { ColorPicker } from '@/components/ui/color-picker';
import { IconPicker, IconDisplay } from '@/components/ui/icon-picker';

const StylesPage: React.FC = () => {
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
  return <StyleManager />;
}

function StyleManager() {
  const styles = useQuery(api.styles.getStyles, {});
  const createStyle = useMutation(api.styles.createStyle);
  const updateStyle = useMutation(api.styles.updateStyle);
  const deleteStyle = useMutation(api.styles.deleteStyle);
  const { theme, setTheme } = useTheme();

  const [newStyleId, setNewStyleId] = useState('');
  const [newStyleName, setNewStyleName] = useState('');
  const [newStyleDescription, setNewStyleDescription] = useState('');
  const [newStyleStructure, setNewStyleStructure] = useState('');
  const [newStyleColor, setNewStyleColor] = useState('');
  const [newStyleIcon, setNewStyleIcon] = useState('');
  const [newStyleExamples, setNewStyleExamples] = useState<string[]>(['']);
  const [newStylePromptGuidance, setNewStylePromptGuidance] = useState('');
  const [newStyleOrder, setNewStyleOrder] = useState('');
  const [editingStyle, setEditingStyle] = useState<Doc<"styles"> | null>(null);
  const [searchText, setSearchText] = useState('');

  const handleCreateStyle = () => {
    if (newStyleName.trim()) {
      void createStyle({
        id: newStyleId,
        name: newStyleName,
        description: newStyleDescription,
        structure: newStyleStructure,
        color: newStyleColor,
        icon: newStyleIcon,
        promptGuidanceForAI: newStylePromptGuidance,
        order: newStyleOrder ? parseFloat(newStyleOrder) : undefined,
      });
      setNewStyleName('');
      setNewStyleDescription('');
      setNewStyleStructure('');
      setNewStyleColor('');
      setNewStyleIcon('');
      setNewStyleExamples(['']);
      setNewStylePromptGuidance('');
      setNewStyleOrder('');
    }
  };

  const handleUpdateStyle = () => {
    if (editingStyle && editingStyle.name.trim()) {
      void updateStyle({
        _id: editingStyle._id,
        id: editingStyle.id,
        name: editingStyle.name,
        description: editingStyle.description,
        structure: editingStyle.structure,
        color: editingStyle.color,
        icon: editingStyle.icon,
        promptGuidanceForAI: editingStyle.promptGuidanceForAI,
        order: editingStyle.order,
      });
      setEditingStyle(null);
    }
  };

  const handleDeleteStyle = (id: Id<"styles">) => {
    void deleteStyle({ id });
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
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-4 sm:mb-6">Create New Style</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Style ID</label>
              <input
                type="text"
                value={newStyleId}
                onChange={(e) => setNewStyleId(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter style id"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Style Name</label>
              <input
                type="text"
                value={newStyleName}
                onChange={(e) => setNewStyleName(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter style name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Color</label>
              <ColorPicker
                color={newStyleColor}
                onChange={setNewStyleColor}
                className="w-10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Icon</label>
              <IconPicker
                value={newStyleIcon}
                onChange={setNewStyleIcon}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Order</label>
              <input
                type="number"
                value={newStyleOrder}
                onChange={(e) => setNewStyleOrder(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter order"
              />
            </div>
          </div>
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
              <textarea
                value={newStyleDescription}
                onChange={(e) => setNewStyleDescription(e.target.value)}
                rows={3}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter style description"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Structure</label>
              <textarea
                value={newStyleStructure}
                onChange={(e) => setNewStyleStructure(e.target.value)}
                rows={3}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter style structure"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Examples</label>
              <div className="space-y-2">
                {newStyleExamples.map((example, index) => (
                  <div key={index} className="flex gap-2">
                    <textarea
                      value={example}
                      onChange={(e) => {
                        const updated = [...newStyleExamples];
                        updated[index] = e.target.value;
                        setNewStyleExamples(updated);
                      }}
                      rows={2}
                      className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={`Enter example ${index + 1}`}
                    />
                    <button
                      onClick={() => {
                        const updated = newStyleExamples.filter((_, i) => i !== index);
                        setNewStyleExamples(updated.length > 0 ? updated : ['']);
                      }}
                      className="p-2 text-red-500 hover:text-red-600 self-start"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setNewStyleExamples([...newStyleExamples, ''])}
                  className="text-sm text-blue-500 hover:text-blue-600 font-medium flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Example
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prompt Guidance</label>
              <textarea
                value={newStylePromptGuidance}
                onChange={(e) => setNewStylePromptGuidance(e.target.value)}
                rows={3}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter style prompt guidance"
              />
            </div>
          </div>
          <button
            onClick={handleCreateStyle}
            className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium transition-colors text-base"
          >
            Create Style
          </button>
        </div>
        <div className="mb-6 sm:mb-8 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Search styles..."
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
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Structure</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Color</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Icon</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Examples</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Prompt Guidance</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Order</th>
                <th className="text-left p-4 text-sm font-medium text-gray-900 dark:text-white">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {styles?.filter(style => {
                const searchLower = searchText.toLowerCase();
                return style.name.toLowerCase().includes(searchLower) ||
                  (style.description && style.description.toLowerCase().includes(searchLower))
              }).map((style) => (
                <tr key={style._id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="p-4 align-top">
                    {editingStyle?._id === style._id ? (
                      <input
                        type="text"
                        value={editingStyle.name}
                        onChange={(e) => setEditingStyle({ ...editingStyle, name: e.target.value })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <span className="text-gray-900 dark:text-white">{style.name}</span>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    {editingStyle?._id === style._id ? (
                      <textarea
                        value={editingStyle.description ?? ''}
                        onChange={(e) => setEditingStyle({ ...editingStyle, description: e.target.value })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={3}
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">{style.description}</span>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    {editingStyle?._id === style._id ? (
                      <textarea
                        rows={3}
                        value={editingStyle.structure}
                        onChange={(e) => setEditingStyle({ ...editingStyle, structure: e.target.value })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">{style.structure}</span>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    {editingStyle?._id === style._id ? (
                      <ColorPicker
                        color={editingStyle.color}
                        onChange={(color) => setEditingStyle({ ...editingStyle, color })}
                        className="w-10"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded border border-gray-200 dark:border-gray-700" style={{ backgroundColor: style.color }}></div>
                        <span className="text-gray-600 dark:text-gray-400">{style.color}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    {editingStyle?._id === style._id ? (
                      <IconPicker
                        value={editingStyle.icon}
                        onChange={(icon) => setEditingStyle({ ...editingStyle, icon })}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <IconDisplay name={style.icon} className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        <span className="text-gray-600 dark:text-gray-400">{style.icon}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    {editingStyle?._id === style._id ? (
                      <textarea
                        rows={3}
                        value={editingStyle.promptGuidanceForAI ?? ''}
                        onChange={(e) => setEditingStyle({ ...editingStyle, promptGuidanceForAI: e.target.value })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">{style.promptGuidanceForAI}</span>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    {editingStyle?._id === style._id ? (
                      <input
                        type="number"
                        value={editingStyle.order ?? ''}
                        onChange={(e) => setEditingStyle({ ...editingStyle, order: e.target.value ? parseFloat(e.target.value) : undefined })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">{style.order}</span>
                    )}
                  </td>
                  <td className="p-4 align-top">
                    <div className="flex gap-2">
                      {editingStyle?._id === style._id ? (
                        <div className="flex gap-2">
                          <button onClick={handleUpdateStyle} className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Save</button>
                          <button onClick={() => setEditingStyle(null)} className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setEditingStyle(style)} className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Edit</button>
                      )}
                      <button onClick={() => handleDeleteStyle(style._id)} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm font-medium transition-colors">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="lg:hidden space-y-4">
          {styles?.filter(style => {
            const searchLower = searchText.toLowerCase();
            return style.name.toLowerCase().includes(searchLower) ||
              (style.description && style.description.toLowerCase().includes(searchLower))
          }).map((style) => (
            <div key={style._id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
                  {editingStyle?._id === style._id ? (
                    <input
                      type="text"
                      value={editingStyle.name}
                      onChange={(e) => setEditingStyle({ ...editingStyle, name: e.target.value })}
                      className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <span className="text-gray-900 dark:text-white text-base">{style.name}</span>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
                  {editingStyle?._id === style._id ? (
                    <textarea
                      value={editingStyle.description ?? ''}
                      onChange={(e) => setEditingStyle({ ...editingStyle, description: e.target.value })}
                      className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={3}
                    />
                  ) : (
                    <span className="text-gray-600 dark:text-gray-400 text-sm">{style.description}</span>
                  )}
                </div>

                {/* Color and Icon */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Color</label>
                    {editingStyle?._id === style._id ? (
                      <ColorPicker
                        color={editingStyle.color}
                        onChange={(color) => setEditingStyle({ ...editingStyle, color })}
                        className="w-10"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded border border-gray-200 dark:border-gray-700" style={{ backgroundColor: style.color }}></div>
                        <span className="text-gray-600 dark:text-gray-400 text-sm">{style.color}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Icon</label>
                    {editingStyle?._id === style._id ? (
                      <IconPicker
                        value={editingStyle.icon}
                        onChange={(icon) => setEditingStyle({ ...editingStyle, icon })}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <IconDisplay name={style.icon} className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        <span className="text-gray-600 dark:text-gray-400 text-sm">{style.icon}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Structure */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Structure</label>
                  {editingStyle?._id === style._id ? (
                    <textarea
                      rows={3}
                      value={editingStyle.structure}
                      onChange={(e) => setEditingStyle({ ...editingStyle, structure: e.target.value })}
                      className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <span className="text-gray-600 dark:text-gray-400 text-sm">{style.structure}</span>
                  )}
                </div>

                {/* Prompt Guidance */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prompt Guidance</label>
                  {editingStyle?._id === style._id ? (
                    <textarea
                      rows={3}
                      value={editingStyle.promptGuidanceForAI ?? ''}
                      onChange={(e) => setEditingStyle({ ...editingStyle, promptGuidanceForAI: e.target.value })}
                      className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <span className="text-gray-600 dark:text-gray-400 text-sm">{style.promptGuidanceForAI}</span>
                  )}
                </div>

                {/* Order */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Order</label>
                  {editingStyle?._id === style._id ? (
                    <input
                      type="number"
                      value={editingStyle.order ?? ''}
                      onChange={(e) => setEditingStyle({ ...editingStyle, order: e.target.value ? parseFloat(e.target.value) : undefined })}
                      className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-3 rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <span className="text-gray-600 dark:text-gray-400 text-sm">{style.order}</span>
                  )}
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row gap-3">
                    {editingStyle?._id === style._id ? (
                      <>
                        <button
                          onClick={handleUpdateStyle}
                          className="flex-1 bg-green-500 hover:bg-green-600 text-white px-4 py-3 rounded-lg font-medium transition-colors text-base"
                        >
                          Save Changes
                        </button>
                        <button
                          onClick={() => setEditingStyle(null)}
                          className="flex-1 bg-gray-500 hover:bg-gray-600 text-white px-4 py-3 rounded-lg font-medium transition-colors text-base"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setEditingStyle(style)}
                        className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-3 rounded-lg font-medium transition-colors text-base"
                      >
                        Edit Style
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteStyle(style._id)}
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

export default StylesPage;
