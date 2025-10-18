#!/bin/bash

# Script to restore all MongoDB dump chunks in the correct order
# Reads from dump_manifest.txt to restore chunks oldest-first

set -e  # Exit on error

# Configuration
DB_NAME="test"  # Update this to your target database name
DUMP_DIR="./mongo_dumps"
MANIFEST_FILE="${DUMP_DIR}/dump_manifest.txt"

echo "========================================"
echo "MongoDB Restore Script"
echo "========================================"
echo "Database: $DB_NAME"
echo "Manifest: $MANIFEST_FILE"
echo ""

# Check if manifest exists
if [ ! -f "$MANIFEST_FILE" ]; then
    echo "Error: Manifest file not found at $MANIFEST_FILE"
    echo "Please ensure dump_manifest.txt is in the dump directory."
    exit 1
fi

# Count total chunks
TOTAL_CHUNKS=$(wc -l < "$MANIFEST_FILE")
echo "Found $TOTAL_CHUNKS dump chunks to restore"
echo ""

# Show what will be restored
echo "Dump chunks (oldest first):"
echo "----------------------------------------"
cat "$MANIFEST_FILE" | nl -w2 -s'. '
echo ""

# Ask for confirmation
read -p "Proceed with restore? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo ""
echo "Starting restore process..."
echo ""

# Counter
CURRENT=0

# Read manifest line by line and restore in order (oldest first)
while IFS='|' read -r DUMP_NAME CUTOFF_TIMESTAMP DOC_COUNT DUMP_SIZE CREATED_AT; do
    CURRENT=$((CURRENT + 1))
    DUMP_PATH="${DUMP_DIR}/${DUMP_NAME}"

    echo "========================================"
    echo "[$CURRENT/$TOTAL_CHUNKS] Restoring: $DUMP_NAME"
    echo "========================================"
    echo "Documents: $DOC_COUNT"
    echo "Size: $DUMP_SIZE"
    echo "Created: $CREATED_AT"
    echo ""

    # Check if dump directory exists
    if [ ! -d "$DUMP_PATH" ]; then
        echo "Warning: Dump directory not found: $DUMP_PATH"
        echo "Skipping..."
        echo ""
        continue
    fi

    # Restore this chunk
    echo "Running mongorestore..."
    mongorestore --db=$DB_NAME "$DUMP_PATH/$DB_NAME/"

    echo ""
    echo "✓ Chunk restored successfully"
    echo ""

done < "$MANIFEST_FILE"

echo "========================================"
echo "Restore Complete!"
echo "========================================"
echo "Restored $TOTAL_CHUNKS chunks to database: $DB_NAME"
echo ""

# Show collection stats
echo "Collection stats:"
mongo $DB_NAME --quiet --eval "
    var stats = db.buoys.stats();
    print('Total documents: ' + stats.count);
    print('Storage size: ' + (stats.storageSize / 1024 / 1024).toFixed(2) + ' MB');
    print('Index size: ' + (stats.totalIndexSize / 1024 / 1024).toFixed(2) + ' MB');
"
echo ""

# Show date range
echo "Date range in collection:"
mongo $DB_NAME --quiet --eval "
    var oldest = db.buoys.find().sort({GMT: 1}).limit(1).toArray()[0];
    var newest = db.buoys.find().sort({GMT: -1}).limit(1).toArray()[0];
    if (oldest) print('Oldest: ' + new Date(oldest.GMT));
    if (newest) print('Newest: ' + new Date(newest.GMT));
"
echo ""
echo "All done!"
