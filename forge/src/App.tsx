import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto p-8">
        <h1 className="text-4xl font-bold mb-4">FORGE</h1>
        <p className="text-xl mb-4">A competitive card drafting game</p>

        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-2xl mb-4">Development Status</h2>
          <p className="mb-2">Phase 1: Project Setup ✓</p>
          <p className="mb-4 text-gray-400">Next: Implement game logic</p>

          <button
            onClick={() => setCount(count + 1)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
          >
            Test Counter: {count}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
