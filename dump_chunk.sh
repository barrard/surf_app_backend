#!/bin/bash

# Script to dump a chunk of old MongoDB buoy data, then delete it
# Run this multiple times, moving the dump file off the server between runs

set -e  # Exit on error

# Configuration
DB_NAME="surf_app"
COLLECTION="buoydatas"
DUMP_DIR="./mongo_dumps"
DAYS_TO_DUMP=70  # Number of days of old data to dump in this chunk (starting from oldest record)

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CHUNK_FILE="${DUMP_DIR}/buoy_chunk_${TIMESTAMP}"

echo "========================================"
echo "MongoDB Chunked Dump Script"
echo "========================================"
echo "Database: $DB_NAME"
echo "Collection: $COLLECTION"
echo "Dumping the oldest $DAYS_TO_DUMP days of data"
echo "Output: $CHUNK_FILE"
echo ""

# Create dump directory if it doesn't exist
mkdir -p "$DUMP_DIR"

# Check available disk space
echo "Current disk usage:"
df -h / | grep -E '(Filesystem|/dev/)'
echo ""

# Get the oldest date in the database
echo "Finding the oldest record..."
OLDEST_DATE_RAW=$(mongo $DB_NAME --quiet --eval "var doc = db.$COLLECTION.find().sort({GMT: 1}).limit(1).toArray()[0]; if(doc) print(doc.GMT);")
echo "Oldest record in database: $OLDEST_DATE_RAW"

# Convert oldest date to epoch seconds and add DAYS_TO_DUMP days
OLDEST_DATE_EPOCH=$(date -d "$OLDEST_DATE_RAW" +%s)
CUTOFF_DATE_EPOCH=$((OLDEST_DATE_EPOCH + (DAYS_TO_DUMP * 86400)))
CUTOFF_DATE=$(date -u -d "@$CUTOFF_DATE_EPOCH" +%Y-%m-%dT%H:%M:%S.000Z)
echo "Cutoff date (oldest + $DAYS_TO_DUMP days): $CUTOFF_DATE"

DOC_COUNT=$(mongo $DB_NAME --quiet --eval "db.$COLLECTION.countDocuments({GMT: {\$lt: ISODate('$CUTOFF_DATE')}})")
echo "Documents to dump: $DOC_COUNT"
echo ""

if [ "$DOC_COUNT" -eq 0 ]; then
    echo "No documents found in the oldest $DAYS_TO_DUMP days. Exiting."
    exit 0
fi

# Perform the dump
echo "Starting mongodump..."
mongodump \
    --db=$DB_NAME \
    --collection=$COLLECTION \
    --query='{"GMT": {"$lt": {"$date": "'"$CUTOFF_DATE"'"}}}' \
    --out="$CHUNK_FILE"

echo ""
echo "Dump completed!"
ls -lh "$CHUNK_FILE/$DB_NAME/"
echo ""

# Calculate size of dump
DUMP_SIZE=$(du -sh "$CHUNK_FILE" | cut -f1)
echo "Dump size: $DUMP_SIZE"
echo ""

# Log this dump to the manifest file
MANIFEST_FILE="${DUMP_DIR}/dump_manifest.txt"
echo "$(basename $CHUNK_FILE)|$CUTOFF_DATE|$DOC_COUNT|$DUMP_SIZE|$(date -u +%Y-%m-%dT%H:%M:%S)" >> "$MANIFEST_FILE"
echo "Added to manifest: $MANIFEST_FILE"
echo ""

# Ask for confirmation before deletion
echo "========================================"
echo "DELETION CONFIRMATION"
echo "========================================"
echo "About to delete $DOC_COUNT documents from the oldest $DAYS_TO_DUMP days"
echo "Dump saved to: $CHUNK_FILE"
echo ""
read -p "Have you copied the dump file off this server? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Deletion cancelled. Please copy the dump file and run the deletion manually:"
    echo "mongo $DB_NAME --eval \"db.$COLLECTION.deleteMany({GMT: {\\\$lt: ISODate('$CUTOFF_DATE')}})\""
    exit 0
fi

# Delete the old data
echo ""
echo "Deleting old data from MongoDB..."
mongo $DB_NAME --eval "db.$COLLECTION.deleteMany({GMT: {\$lt: ISODate('$CUTOFF_DATE')}})"

echo ""
echo "Deletion completed!"
echo ""
echo "Current disk usage after cleanup:"
df -h / | grep -E '(Filesystem|/dev/)'
echo ""
echo "========================================"
echo "Summary"
echo "========================================"
echo "✓ Dumped $DOC_COUNT documents to: $CHUNK_FILE"
echo "✓ Deleted old data from MongoDB"
echo "✓ You can now SCP this file off the server"
echo ""
echo "To copy to another server:"
echo "  scp -r $CHUNK_FILE user@destination:/path/"
echo ""
echo "After copying, you can remove the local dump:"
echo "  rm -rf $CHUNK_FILE"
echo ""
