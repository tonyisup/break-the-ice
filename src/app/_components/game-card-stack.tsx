"use client"

import { useState } from "react"
import { motion, AnimatePresence, type PanInfo } from "framer-motion"
import { cn } from "~/lib/utils"
import { Heart } from "lucide-react"
import { X } from "lucide-react"
import GameCard from "./game-card"

// Sample data for cards
const initialCards = [
  {
    id: 1,
    name: "Sarah, 28",
    image: "/placeholder.svg?height=500&width=400",
    bio: "Adventure seeker and coffee enthusiast",
  },
  {
    id: 2,
    name: "Mike, 32",
    image: "/placeholder.svg?height=500&width=400",
    bio: "Photographer and dog lover",
  },
  {
    id: 3,
    name: "Emma, 26",
    image: "/placeholder.svg?height=500&width=400",
    bio: "Foodie and travel addict",
  },
  {
    id: 4,
    name: "John, 30",
    image: "/placeholder.svg?height=500&width=400",
    bio: "Musician and craft beer connoisseur",
  },
  {
    id: 5,
    name: "Lisa, 27",
    image: "/placeholder.svg?height=500&width=400",
    bio: "Yoga instructor and book worm",
  },
]

export default function GameCardStack() {
  const [cards, setCards] = useState(initialCards)
  const [direction, setDirection] = useState<"left" | "right" | null>(null)

  const removeCard = (id: number, direction: "left" | "right") => {
    setDirection(direction)
    setCards((prev) => prev.filter((card) => card.id !== id))
  }

  const handleDragEnd = (info: PanInfo, id: number) => {
    const threshold = 100
    if (info.offset.x > threshold) {
      removeCard(id, "right")
    } else if (info.offset.x < -threshold) {
      removeCard(id, "left")
    }
  }

  const resetCards = () => {
    setCards(initialCards)
  }

  return (
    <div className="relative h-[600px] w-full">
      <div className="absolute inset-0 flex items-center justify-center">
        {cards.length === 0 ? (
          <div className="text-center">
            <p className="text-xl mb-4">No more cards!</p>
            <button onClick={resetCards} className="px-4 py-2 bg-primary text-white rounded-lg">
              Reset Cards
            </button>
          </div>
        ) : (
          <AnimatePresence>
            {cards.map((card, index) => (
              <motion.div
                key={card.id}
                className={cn(
                  "absolute w-full max-w-[320px]",
                  "cursor-grab active:cursor-grabbing",
                )}
                style={{
                  height: "480px",
                  zIndex: cards.length - index,
                  top: index * 4,
                  left: index * 2,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                  transformOrigin: "bottom center",
                }}
                drag={index === 0}
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                dragElastic={0.9}
                onDragEnd={(_, info) => handleDragEnd(info, card.id)}
                whileDrag={{ scale: 1.05 }}
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={
                  direction === "left"
                    ? { x: -300, opacity: 0, rotate: -20 }
                    : direction === "right"
                      ? { x: 300, opacity: 0, rotate: 20 }
                      : { opacity: 0 }
                }
                transition={{ duration: 0.3 }}
              >
                <div className="relative h-full">
                  <GameCard
                    text={card.name}
                    image={card.image}
                    description={card.bio}
                    className="h-full"
                  />
                  {index === 0 && (
                    <>
                      <div
                        className={cn(
                          "absolute top-6 left-6 bg-red-500 text-white rounded-lg px-4 py-2 font-bold transform -rotate-12 opacity-0",
                          "transition-opacity duration-200",
                        )}
                        style={{
                          opacity: direction === "left" ? 1 : 0,
                        }}
                      >
                        NOPE
                      </div>
                      <div
                        className={cn(
                          "absolute top-6 right-6 bg-green-500 text-white rounded-lg px-4 py-2 font-bold transform rotate-12 opacity-0",
                          "transition-opacity duration-200",
                        )}
                        style={{
                          opacity: direction === "right" ? 1 : 0,
                        }}
                      >
                        LIKE
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {cards && cards.length > 0 && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-8">
          <button
            onClick={() => removeCard(cards[0]?.id ?? 0, "left")}
            className="w-14 h-14 rounded-full bg-white border border-gray-300 flex items-center justify-center shadow-md hover:bg-gray-100 transition-colors"
          >
            <X className="text-red-500" size={24} />
          </button>
          <button
            onClick={() => removeCard(cards[0]?.id ?? 0, "right")}
            className="w-14 h-14 rounded-full bg-white border border-gray-300 flex items-center justify-center shadow-md hover:bg-gray-100 transition-colors"
          >
            <Heart className="text-green-500" size={24} />
          </button>
        </div>
      )}
    </div>
  )
}

