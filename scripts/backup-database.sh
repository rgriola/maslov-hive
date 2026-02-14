#!/bin/bash
# Database backup script for Bot-Talker
# Exports PostgreSQL data from Docker container

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

CONTAINER_NAME="bot-talker-db"
DB_USER="bottalker"
DB_NAME="bottalker_dev"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/bot-talker_${TIMESTAMP}.sql"

echo -e "${GREEN}🗄️  Bot-Talker Database Backup${NC}\n"

# Create backup directory if it doesn't exist
if [ ! -d "$BACKUP_DIR" ]; then
  mkdir -p "$BACKUP_DIR"
  echo -e "${YELLOW}📁 Created backup directory: ${BACKUP_DIR}${NC}"
fi

# Check if Docker container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo -e "${RED}❌ Error: Docker container '${CONTAINER_NAME}' is not running${NC}"
  echo -e "   Start it with: ${YELLOW}npm run dev${NC}"
  exit 1
fi

# Export database
echo -e "${YELLOW}📤 Exporting database...${NC}"
docker exec ${CONTAINER_NAME} pg_dump -U ${DB_USER} ${DB_NAME} > "${BACKUP_FILE}"

# Check if backup was successful
if [ $? -eq 0 ]; then
  FILE_SIZE=$(ls -lh "${BACKUP_FILE}" | awk '{print $5}')
  echo -e "${GREEN}✅ Backup successful!${NC}"
  echo -e "   File: ${BACKUP_FILE}"
  echo -e "   Size: ${FILE_SIZE}"
  
  # Show what's in the backup
  AGENT_COUNT=$(grep -c "INSERT INTO \"Agent\"" "${BACKUP_FILE}" 2>/dev/null || echo "0")
  POST_COUNT=$(grep -c "INSERT INTO \"Post\"" "${BACKUP_FILE}" 2>/dev/null || echo "0")
  COMMENT_COUNT=$(grep -c "INSERT INTO \"Comment\"" "${BACKUP_FILE}" 2>/dev/null || echo "0")
  
  echo -e "\n${GREEN}📊 Backup Contents:${NC}"
  echo -e "   Agents: ${AGENT_COUNT}"
  echo -e "   Posts: ${POST_COUNT}"
  echo -e "   Comments: ${COMMENT_COUNT}"
  
  # Clean up old backups (keep last 10)
  BACKUP_COUNT=$(ls -1 ${BACKUP_DIR}/*.sql 2>/dev/null | wc -l)
  if [ $BACKUP_COUNT -gt 10 ]; then
    echo -e "\n${YELLOW}🧹 Cleaning up old backups (keeping last 10)...${NC}"
    ls -t ${BACKUP_DIR}/*.sql | tail -n +11 | xargs rm -f
  fi
  
  echo -e "\n${GREEN}💡 To restore this backup:${NC}"
  echo -e "   ${YELLOW}psql \"postgresql://connection-string\" < ${BACKUP_FILE}${NC}"
  
else
  echo -e "${RED}❌ Backup failed${NC}"
  exit 1
fi
