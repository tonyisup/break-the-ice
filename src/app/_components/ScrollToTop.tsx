import { useEffect, useState } from "react";
import { ArrowUpToLine } from "lucide-react";
import { Button } from "~/components/ui/button";

function ScrollToTop({ minHeight = 20, scrollTo = 0, ...props }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(document.documentElement.scrollTop >= minHeight);
    };

    onScroll();
    document.addEventListener("scroll", onScroll);

    return () => document.removeEventListener("scroll", onScroll);
  }, [minHeight]);

  return (
    <>
      {visible && (
        <Button
          onClick={() =>
            window.scrollTo({ top: scrollTo, behavior: "smooth" })
          }
          className="fixed bottom-4 right-4 z-50 rounded-full p-2 shadow-lg"
          {...props}
        >
          <ArrowUpToLine className="h-5 w-5" />
        </Button>
      )}
    </>
  );
}

export default ScrollToTop;