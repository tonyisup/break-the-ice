import { cn } from "~/lib/utils"
import Image from "next/image"
import type { Question as PrismaQuestion, Tag } from "@prisma/client";

type Question = PrismaQuestion & {
  tags: Array<{
    tag: Tag;
  }>;
};

interface GameCardProps {
  question: Question
  image?: string
  className?: string
}

export default function GameCard({ question, image, className }: GameCardProps) {
  return (
    <div className={cn("h-full rounded-xl overflow-hidden bg-white dark:bg-black shadow-lg border border-gray-200 flex flex-col justify-center items-center", className)}>
      {image && <div className="relative h-80">
        <Image src={image} alt={question.text} fill className="object-cover" />
      </div>}
      <div className="p-4">
        <h2 className={cn("text-xl font-bold", question.text.length > 150 ? "text-md" : "text-xl")}>{question.text}</h2>
        {question.category && <p className="text-gray-600">{question.category}</p>}
        {question.tags && (
          <div className="flex flex-wrap gap-2 mt-2">
            {question.tags.map(tag => (
              <span key={tag.tag.id} className="px-2 py-1 text-sm rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                {tag.tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

