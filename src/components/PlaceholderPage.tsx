import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";

interface PlaceholderPageProps {
  title: string;
  children: React.ReactNode;
}

export const PlaceholderPage = ({ title, children }: PlaceholderPageProps) => {
  const { effectiveTheme } = useTheme();
  const gradientLight = ["#667EEA", "#A064DE"];
  const gradientDark = ["#3B2554", "#262D54"];

  return (
    <div
      className="min-h-screen transition-colors duration-300 p-8 pt-20"
      style={{
        background: `linear-gradient(135deg, ${effectiveTheme === "dark" ? gradientDark[0] : gradientLight[0]}, ${effectiveTheme === "dark" ? gradientDark[1] : gradientLight[1]}, ${effectiveTheme === "dark" ? "#000" : "#fff"})`
      }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Button variant="ghost" asChild className="-ml-4 mb-4">
            <Link to="/settings" className="flex items-center gap-2 dark:text-gray-400 text-gray-600 hover:dark:text-gray-100 hover:text-gray-900">
              <ArrowLeft className="w-4 h-4" />
              Back to Settings
            </Link>
          </Button>
          <h1 className="text-3xl font-bold mb-4 dark:text-white text-black">{title}</h1>
        </div>
        <div className="prose dark:prose-invert max-w-none bg-white/10 dark:bg-black/20 backdrop-blur-md p-8 rounded-2xl border border-white/20 shadow-xl">
          {children}
        </div>
      </div>
    </div>
  );
};
