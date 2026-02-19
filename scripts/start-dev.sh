#!/bin/bash
# Start Docker, PostgreSQL, and Next.js dev server all together

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Bot-Talker development environment...${NC}\n"

# Function to check if Docker is running
check_docker() {
  docker info &> /dev/null
  return $?
}

# Function to wait for Docker to be ready
wait_for_docker() {
  echo -e "${YELLOW}⏳ Waiting for Docker to be ready...${NC}"
  local max_attempts=30
  local attempt=0
  
  while ! check_docker; do
    attempt=$((attempt + 1))
    if [ $attempt -ge $max_attempts ]; then
      echo -e "${RED}❌ Docker failed to start. Please start Docker Desktop manually.${NC}"
      exit 1
    fi
    sleep 1
  done
  
  echo -e "${GREEN}✅ Docker is running${NC}"
}

# Step 1: Check if Docker is running, start if needed
if ! check_docker; then
  echo -e "${YELLOW}🐳 Docker is not running. Starting Docker Desktop...${NC}"
  
  # macOS-specific: Open Docker Desktop
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open -a Docker
    wait_for_docker
  else
    echo -e "${RED}❌ Please start Docker manually${NC}"
    exit 1
  fi
else
  echo -e "${GREEN}✅ Docker is already running${NC}"
fi

# Step 2: Check if PostgreSQL container exists
CONTAINER_NAME="bot-talker-db"
DB_USER="bottalker"
DB_PASSWORD="localdev123"
DB_NAME="bottalker_dev"
DB_PORT="5433"

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  # Container exists - check if it's running
  if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${GREEN}✅ PostgreSQL container is already running${NC}"
  else
    # Container exists but is stopped
    echo -e "${YELLOW}🔄 Starting existing PostgreSQL container...${NC}"
    docker start ${CONTAINER_NAME}
    echo -e "${GREEN}✅ PostgreSQL container started${NC}"
  fi
else
  # Container doesn't exist - create it
  echo -e "${YELLOW}📦 Creating PostgreSQL container...${NC}"
  docker run --name ${CONTAINER_NAME} \
    -e POSTGRES_USER=${DB_USER} \
    -e POSTGRES_PASSWORD=${DB_PASSWORD} \
    -e POSTGRES_DB=${DB_NAME} \
    -p ${DB_PORT}:5432 \
    -d postgres:15-alpine
  
  echo -e "${GREEN}✅ PostgreSQL container created and started${NC}"
  
  # Wait a bit for PostgreSQL to initialize
  echo -e "${YELLOW}⏳ Waiting for PostgreSQL to initialize...${NC}"
  sleep 3
fi

# Step 3: Verify database connection
echo -e "${YELLOW}🔍 Verifying database connection...${NC}"
if docker exec ${CONTAINER_NAME} pg_isready -U ${DB_USER} &> /dev/null; then
  echo -e "${GREEN}✅ Database is ready${NC}"
else
  echo -e "${YELLOW}⏳ Waiting for database to be ready...${NC}"
  sleep 2
  if docker exec ${CONTAINER_NAME} pg_isready -U ${DB_USER} &> /dev/null; then
    echo -e "${GREEN}✅ Database is ready${NC}"
  else
    echo -e "${RED}⚠️  Database might still be initializing, but continuing...${NC}"
  fi
fi

# Step 4: Sync database schema with Prisma
echo -e "${YELLOW}🗄️  Syncing database schema...${NC}"
if npx prisma db push --skip-generate &> /dev/null; then
  echo -e "${GREEN}✅ Database schema is up to date${NC}"
else
  echo -e "${RED}⚠️  Schema sync had issues, but continuing...${NC}"
fi

# Step 5: Start Next.js dev server
# NEXT_TURBOPACK_PERSISTENT_CACHING=0 disables SST file caching that can corrupt
echo -e "\n${GREEN}🌐 Starting Next.js development server...${NC}\n"
NEXT_TURBOPACK_PERSISTENT_CACHING=0 exec next dev
