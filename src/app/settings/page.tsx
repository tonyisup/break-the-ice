"use client";

import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

const SettingsPage = () => {
  const allStyles = useQuery(api.styles.getStyles);
  const allTones = useQuery(api.tones.getTones);

  const [hiddenStyles, setHiddenStyles] = useLocalStorage<string[]>("hiddenStyles", []);
  const [hiddenTones, setHiddenTones] = useLocalStorage<string[]>("hiddenTones", []);

  const unhideStyle = (styleId: string) => {
    setHiddenStyles(prev => prev.filter(id => id !== styleId));
  };

  const unhideTone = (toneId: string) => {
    setHiddenTones(prev => prev.filter(id => id !== toneId));
  };

  const hiddenStyleObjects = allStyles?.filter(style => hiddenStyles.includes(style.id));
  const hiddenToneObjects = allTones?.filter(tone => hiddenTones.includes(tone.id));

  return (
    <div className="container mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-200">Settings</h1>

      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold mb-4 border-b pb-2 text-gray-700 dark:text-gray-300">Hidden Styles</h2>
          {hiddenStyleObjects && hiddenStyleObjects.length > 0 ? (
            <ul className="space-y-2">
              {hiddenStyleObjects.map(style => (
                <li key={style.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-gray-800 dark:text-gray-200">{style.name}</span>
                  <button
                    onClick={() => unhideStyle(style.id)}
                    className="px-3 py-1 text-sm font-semibold bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Unhide
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">You have no hidden styles.</p>
          )}
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4 border-b pb-2 text-gray-700 dark:text-gray-300">Hidden Tones</h2>
          {hiddenToneObjects && hiddenToneObjects.length > 0 ? (
            <ul className="space-y-2">
              {hiddenToneObjects.map(tone => (
                <li key={tone.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-gray-800 dark:text-gray-200">{tone.name}</span>
                  <button
                    onClick={() => unhideTone(tone.id)}
                    className="px-3 py-1 text-sm font-semibold bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Unhide
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">You have no hidden tones.</p>
          )}
        </section>
      </div>
    </div>
  );
};

export default SettingsPage;
