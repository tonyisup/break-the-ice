)import { Link } from "react-router-dom";
import { MoveRight } from "lucide-react";

const LandingPage = () => {
  return (
    <div className="flex flex-col min-h-screen bg-gray-900 text-white">
      <header className="p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Break the Ice(berg)</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center p-4">
        <h2 className="text-5xl font-bold mb-4">Welcome to Break the Ice(berg)</h2>
        <p className="text-xl mb-8 text-gray-400">The fun way to start conversations and connect with people.</p>

        <div className="w-full max-w-4xl bg-gray-800 rounded-lg shadow-lg aspect-video mb-8">
          {/* Placeholder for the product showcase video */}
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Your product showcase video will be here.</p>
          </div>
        </div>

        <Link
          to="/app"
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-full text-lg transition-transform transform hover:scale-105 flex items-center"
        >
          Enter the App
          <MoveRight className="ml-2" />
        </Link>
      </main>

      <footer className="p-4 text-center text-gray-500">
        <p>&copy; {new Date().getFullYear()} Break the Iceberg. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default LandingPage;
