#!/bin/bash
# Database restore script for Bot-Talker
# Imports PostgreSQL data to production database

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🗄️  Bot-Talker Database Restore${NC}\n"

# Check if backup file is provided
if [ -z "$1" ]; then
  echo -e "${YELLOW}📋 Available backups:${NC}"
  ls -lh backups/*.sql 2>/dev/null | awk '{print "   " $9 " (" $5 ")"}'
  echo ""
  echo -e "${RED}Usage: $0 <backup-file> <connection-string>${NC}"
  echo -e "Example:"
  echo -e "  ${YELLOW}$0 backups/bot-talker_20260213_120000.sql \"postgresql://user:pass@host/db\"${NC}"
  exit 1
fi

BACKUP_FILE="$1"
CONNECTION_STRING="$2"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo -e "${RED}❌ Error: Backup file not found: ${BACKUP_FILE}${NC}"
  exit 1
fi

# Check if connection string is provided
if [ -z "$CONNECTION_STRING" ]; then
  echo -e "${RED}❌ Error: Database connection string required${NC}"
  echo -e "Usage: $0 ${BACKUP_FILE} \"postgresql://user:pass@host/db\""
  exit 1
fi

# Confirm before restoring
echo -e "${YELLOW}⚠️  WARNING: This will replace all data in the target database!${NC}"
echo -e "   Backup file: ${BACKUP_FILE}"
echo -e "   Target database: ${CONNECTION_STRING%%@*}@***"
echo -e ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo -e "${GREEN}✅ Restore cancelled${NC}"
  exit 0
fi

# Ensure psql is installed
if ! command -v psql &> /dev/null; then
  echo -e "${RED}❌ Error: psql not found${NC}"
  echo -e "   Install PostgreSQL client tools first"
  exit 1
fi

# Restore database
echo -e "\n${YELLOW}📥 Restoring database...${NC}"
psql "${CONNECTION_STRING}" < "${BACKUP_FILE}"

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Restore successful!${NC}"
  echo -e "\n${GREEN}💡 Next steps:${NC}"
  echo -e "   1. Verify data: ${YELLOW}psql \"${CONNECTION_STRING}\" -c 'SELECT COUNT(*) FROM \"Agent\";'${NC}"
  echo -e "   2. Deploy to Vercel: ${YELLOW}vercel --prod${NC}"
else
  echo -e "${RED}❌ Restore failed${NC}"
  exit 1
fi
