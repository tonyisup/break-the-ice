"use client"

import { useEffect, useState } from "react"
import "./card-shuffle.css"

export default function CardShuffleLoader() {

  return (
    <div className="flex items-center justify-center min-h-[300px] w-full rounded-lg p-8">
      <div className="card-shuffle-container">
        <div className="card card-base">
          <div className="card-face">
            <div className="card-symbol">♠</div>
          </div>
        </div>

        <div className="card card-1">
          <div className="card-face">
            <div className="card-symbol red">♥</div>
          </div>
        </div>

        <div className="card card-2">
          <div className="card-face">
            <div className="card-symbol blue">♣</div>
          </div>
        </div>

        <div className="card card-3">
          <div className="card-face">
            <div className="card-symbol red">♦</div>
          </div>
        </div>

        <div className="card card-4">
          <div className="card-face">
            <div className="card-symbol">♠</div>
          </div>
        </div>

        <p className="loading-text">Loading...</p>
      </div>
    </div>
  )
}
