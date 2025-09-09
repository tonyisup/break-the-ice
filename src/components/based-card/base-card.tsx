import { AnimatePresence } from "framer-motion"

import { motion } from "framer-motion";
import { useRef } from "react";

interface BaseCardProps {
  gradient: Record<string, string>;
  children: React.ReactNode;
}

export function BaseCard({ gradient, children }: BaseCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  return (

    <AnimatePresence>
      <motion.div
        ref={cardRef}
        initial={{ scale: .8, rotate: 0 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{
          type: "spring",
          stiffness: 50,
          damping: 7,
          duration: 0.3
        }}
        className="w-full max-w-md mx-auto"
      >
        <div
          className="w-full h-full rounded-[30px] p-[3px]"
          style={{
            background: `linear-gradient(135deg, ${gradient.tone}, ${gradient.style})`
          }}
        >
          <div className="w-full h-full bg-white/95 dark:bg-gray-900/95 rounded-[27px] p-8 flex flex-col justify-center items-center">
            {children}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}