import { cn } from "~/lib/utils"
import Image from "next/image"

interface GameCardProps {
  text: string
  image?: string
  description?: string
  className?: string
}

export default function GameCard({ text, image, description, className }: GameCardProps) {
  return (
    <div className={cn("h-full rounded-xl overflow-hidden bg-white dark:bg-black shadow-lg border border-gray-200 flex flex-col justify-center items-center", className)}>
      {image && <div className="relative h-80">
        <Image src={image} alt={text} fill className="object-cover" />
      </div>}
      <div className="p-4">
        <h2 className="text-xl font-bold">{text}</h2>
        {description && <p className="text-gray-600">{description}</p>}
      </div>
    </div>
  )
}

