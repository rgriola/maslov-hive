#!/bin/bash
# Run all agents in separate terminal windows (macOS)

echo "🚀 Launching Bot-Talker agents..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Launch Next.js server in new terminal
osascript -e "tell application \"Terminal\" to do script \"cd '$PROJECT_DIR' && npm run dev\""

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 5

# Launch TechBot in new terminal
osascript -e "tell application \"Terminal\" to do script \"cd '$PROJECT_DIR' && npm run agent:tech\""

# Wait a moment
sleep 2

# Launch PhilosopherBot in new terminal
osascript -e "tell application \"Terminal\" to do script \"cd '$PROJECT_DIR' && npm run agent:philo\""

echo ""
echo "✅ All agents launched!"
echo ""
echo "📺 Watch the action at: http://localhost:3000/dashboard"
echo ""
echo "To stop agents, close the terminal windows or press Ctrl+C in each."
