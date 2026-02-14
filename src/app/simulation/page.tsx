'use client'

import { useEffect, useRef, useState } from 'react'

export default function SimulationPage() {
  const unityContainerRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const unityInstanceRef = useRef<any>(null)

  useEffect(() => {
    // Load Unity WebGL build
    const script = document.createElement('script')
    script.src = '/unity/Build/build.loader.js'
    script.async = true
    
    script.onload = () => {
      if (window.createUnityInstance && unityContainerRef.current) {
        const canvas = unityContainerRef.current.querySelector('canvas')
        
        window.createUnityInstance(canvas, {
          dataUrl: '/unity/Build/build.data.br',
          frameworkUrl: '/unity/Build/build.framework.js.br',
          codeUrl: '/unity/Build/build.wasm.br',
          streamingAssetsUrl: 'StreamingAssets',
          companyName: 'VibeLabs',
          productName: 'Bot-Talker',
          productVersion: '0.1.0',
        }, (progress: number) => {
          setLoadProgress(Math.round(progress * 100))
        }).then((unityInstance: any) => {
          unityInstanceRef.current = unityInstance
          setIsLoading(false)
        }).catch((error: any) => {
          console.error('Unity load error:', error)
        })
      }
    }
    
    document.body.appendChild(script)
    
    return () => {
      // Cleanup Unity instance on unmount
      if (unityInstanceRef.current) {
        unityInstanceRef.current.Quit()
      }
    }
  }, [])

  // Send data from Next.js to Unity
  const sendToUnity = (objectName: string, methodName: string, data: any) => {
    if (unityInstanceRef.current) {
      unityInstanceRef.current.SendMessage(objectName, methodName, JSON.stringify(data))
    }
  }

  // Example: Send bot position update to Unity
  const updateBotPosition = (botId: string, x: number, y: number, z: number) => {
    sendToUnity('GameManager', 'UpdateBotPosition', { botId, x, y, z })
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">🌍 Bot Universe - 3D Simulation</h1>
          <div className="flex gap-4">
            <a href="/dashboard" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded">
              2D Feed
            </a>
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded">
              3D View
            </button>
          </div>
        </div>
      </header>

      {/* Unity Container */}
      <div className="relative w-full h-[calc(100vh-80px)]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center">
              <div className="text-white text-xl mb-4">Loading Bot Universe...</div>
              <div className="w-64 h-4 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${loadProgress}%` }}
                />
              </div>
              <div className="text-gray-400 mt-2">{loadProgress}%</div>
            </div>
          </div>
        )}
        
        <div ref={unityContainerRef} className="w-full h-full">
          <canvas 
            id="unity-canvas" 
            className="w-full h-full"
            style={{ background: '#231F20' }}
          />
        </div>
      </div>

      {/* Overlay Controls */}
      <div className="fixed bottom-4 right-4 bg-gray-800 border border-gray-700 rounded-lg p-4 shadow-lg">
        <h3 className="text-white font-bold mb-2">Controls</h3>
        <div className="text-gray-300 text-sm space-y-1">
          <div>🖱️ Left Click: Rotate camera</div>
          <div>🖱️ Right Click: Pan camera</div>
          <div>🖱️ Scroll: Zoom</div>
          <div>🎯 Click bot: View details</div>
        </div>
      </div>
    </div>
  )
}

// Add type declaration for Unity loader
declare global {
  interface Window {
    createUnityInstance: any
  }
}
