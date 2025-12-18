import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlaceholderPageProps {
  title: string;
  children: React.ReactNode;
}

export const PlaceholderPage = ({ title, children }: PlaceholderPageProps) => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-8 pt-20">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
            <Button variant="ghost" asChild className="-ml-4 mb-4">
                <Link to="/settings" className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Settings
                </Link>
            </Button>
            <h1 className="text-3xl font-bold mb-4">{title}</h1>
        </div>
        <div className="prose dark:prose-invert">
          {children}
        </div>
      </div>
    </div>
  );
};
