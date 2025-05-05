"use client"

import type React from "react"

import "./card-shuffle.css"
import Image from "next/image"

export interface CardShuffleLoaderProps {
  /** Width of each card in pixels (default: 60) */
  cardWidth?: number
  /** Height of each card in pixels (default: 90) */
  cardHeight?: number
  /** Animation duration in seconds (default: 2) */
  animationSpeed?: number
  /** Number of animated cards (default: 4) */
  cardCount?: number
  /** Custom card faces/images */
  cardFaces?: Array<{
    symbol?: string
    color?: string
    image?: string
    bgColor?: string
  }>
  /** Container width in pixels (default: 240) */
  containerWidth?: number
  /** Container height in pixels (default: 160) */
  containerHeight?: number
  /** Loading text (default: "Loading...") */
  loadingText?: string
  /** Background color of the container */
  backgroundColor?: string
  /** Border radius of cards in pixels (default: 8) */
  borderRadius?: number
  /** Auto-hide after specified milliseconds (0 to disable) */
  autoHideAfter?: number
  /** Card shadow intensity (0-1, default: 0.1) */
  shadowIntensity?: number
}

export default function CardShuffleLoader({
  cardWidth = 60,
  cardHeight = 90,
  animationSpeed = .5,
  cardCount = 4,
  cardFaces,
  containerWidth = 240,
  containerHeight = 160,
  loadingText = "Loading...",
  backgroundColor = "transparent",
  borderRadius = 8,
  shadowIntensity = 0.1,
}: CardShuffleLoaderProps) {

  // Default card faces if not provided
  const defaultCardFaces = [
    { symbol: "♠", color: "#000000", image: null, bgColor: "black" },
    { symbol: "♥", color: "#ef4444", image: null, bgColor: "black" },
    { symbol: "♣", color: "#3b82f6", image: null, bgColor: "black" },
    { symbol: "♦", color: "#ef4444", image: null, bgColor: "black" },
    { symbol: "♠", color: "#000000", image: null, bgColor: "black" },
  ]

  // Use provided card faces or defaults
  const faces = cardFaces ?? defaultCardFaces

  // Generate CSS variables for dynamic styling
  const cssVars = {
    "--card-width": `${cardWidth}px`,
    "--card-height": `${cardHeight}px`,
    "--container-width": `${containerWidth}px`,
    "--container-height": `${containerHeight}px`,
    "--animation-speed": `${animationSpeed}s`,
    "--border-radius": `${borderRadius}px`,
    "--background-color": backgroundColor,
    "--shadow-intensity": shadowIntensity,
  } as React.CSSProperties

  return (
    <div className="flex items-center justify-center min-h-[300px] w-full rounded-lg p-8" style={{ backgroundColor }}>
        <div className="card-shuffle-container" style={cssVars}>
          {/* Base card */}
          <div className="card card-base">
            <div className="card-face">
              {faces[0]?.image ? (
                <Image src={faces[0]?.image ?? "/placeholder.svg"} alt="Card face" className="card-image" />
              ) : (
                <div
                  className="card-symbol"
                  style={{
                    color: faces[0]?.color,
                    backgroundColor: faces[0]?.bgColor,
                  }}
                >
                  {faces[0]?.symbol}
                </div>
              )}
            </div>
          </div>

          {/* Animated cards */}
          {Array.from({ length: Math.min(cardCount, faces.length - 1) }).map((_, index) => {
            const faceIndex = (index % (faces.length - 1)) + 1
            return (
              <div
                key={index}
                className={`card card-${index + 1}`}
                style={{
                  animationDelay: `${(index * animationSpeed) / (2 * cardCount)}s`,
                }}
              >
                <div className="card-face">
                  {faces[faceIndex]?.image ? (
                    <Image
                      src={faces[faceIndex]?.image || "/placeholder.svg"}
                      alt={`Card face ${index + 1}`}
                      className="card-image"
                    />
                  ) : (
                    <div
                      className="card-symbol"
                      style={{
                        color: faces[faceIndex]?.color,
                        backgroundColor: faces[faceIndex]?.bgColor,
                      }}
                    >
                      {faces[faceIndex]?.symbol}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          <p className="loading-text">{loadingText}</p>
        </div>
    </div>
  )
}

CardShuffleLoader.displayName = "CardShuffleLoader";