#!/usr/bin/env python3
"""
Deduplicate video IDs across multiple CSV files.
Keeps the first occurrence of each video ID and removes duplicates.
"""
import csv
import os
import sys
from collections import OrderedDict
from pathlib import Path


def read_csv_with_header(filepath):
    """Read a CSV file and return header and rows."""
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)
    return header, rows


def write_csv_with_header(filepath, header, rows):
    """Write header and rows to a CSV file."""
    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)


def deduplicate_csvs(csv_files, output_dir=None):
    """
    Deduplicate video IDs across multiple CSV files.
    
    Args:
        csv_files: List of CSV file paths
        output_dir: Directory to save deduplicated files (None = overwrite originals)
    
    Returns:
        Dictionary with statistics
    """
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
    
    # Track all seen video IDs globally
    seen_video_ids = set()
    
    stats = {
        'total_files': len(csv_files),
        'total_videos_before': 0,
        'total_videos_after': 0,
        'duplicates_removed': 0,
        'files_processed': []
    }
    
    print(f"\n{'='*60}")
    print("DEDUPLICATING VIDEO IDs ACROSS ALL CSV FILES")
    print(f"{'='*60}\n")
    
    for csv_file in csv_files:
        if not os.path.exists(csv_file):
            print(f"⚠️  Warning: File not found: {csv_file}")
            continue
        
        filename = os.path.basename(csv_file)
        print(f"Processing: {filename}")
        
        try:
            # Read the CSV
            header, rows = read_csv_with_header(csv_file)
            
            if not rows:
                print(f"  → Empty file, skipping\n")
                continue
            
            # Assuming ID is in the first column
            original_count = len(rows)
            stats['total_videos_before'] += original_count
            
            # Deduplicate within this file and against global seen IDs
            deduplicated_rows = []
            local_duplicates = 0
            
            for row in rows:
                if not row:  # Skip empty rows
                    continue
                    
                video_id = row[0]  # ID is first column
                
                if video_id not in seen_video_ids:
                    seen_video_ids.add(video_id)
                    deduplicated_rows.append(row)
                else:
                    local_duplicates += 1
            
            new_count = len(deduplicated_rows)
            removed = original_count - new_count
            stats['total_videos_after'] += new_count
            stats['duplicates_removed'] += removed
            
            # Determine output path
            if output_dir:
                output_path = os.path.join(output_dir, filename)
            else:
                output_path = csv_file
            
            # Write deduplicated data
            write_csv_with_header(output_path, header, deduplicated_rows)
            
            stats['files_processed'].append({
                'filename': filename,
                'original': original_count,
                'deduplicated': new_count,
                'removed': removed
            })
            
            if removed > 0:
                print(f"  ✅ {original_count} → {new_count} videos ({removed} duplicates removed)")
            else:
                print(f"  ✅ {new_count} videos (no duplicates)")
            print()
            
        except Exception as e:
            print(f"  ❌ Error processing {filename}: {e}\n")
            continue
    
    return stats


def print_summary(stats):
    """Print a summary of the deduplication results."""
    print(f"\n{'='*60}")
    print("DEDUPLICATION SUMMARY")
    print(f"{'='*60}")
    print(f"Files processed: {stats['total_files']}")
    print(f"Total videos before: {stats['total_videos_before']}")
    print(f"Total videos after: {stats['total_videos_after']}")
    print(f"Duplicates removed: {stats['duplicates_removed']}")
    print(f"{'='*60}\n")
    
    if stats['files_processed']:
        print("Per-file breakdown:")
        for file_stat in stats['files_processed']:
            if file_stat['removed'] > 0:
                print(f"  📄 {file_stat['filename']}: "
                      f"{file_stat['original']} → {file_stat['deduplicated']} "
                      f"(-{file_stat['removed']})")
            else:
                print(f"  📄 {file_stat['filename']}: "
                      f"{file_stat['deduplicated']} (no change)")


def main():
    """Main function."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Deduplicate video IDs across CSV files',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Deduplicate all CSV files in current directory (overwrites originals)
  python3 deduplicate.py *.csv
  
  # Deduplicate specific files
  python3 deduplicate.py wl2_public.csv wl3_public.csv
  
  # Save deduplicated files to a different directory
  python3 deduplicate.py --output deduplicated/ *.csv
  
  # Deduplicate all *_public.csv files
  python3 deduplicate.py *_public.csv
  
  # Deduplicate all *_private.csv files
  python3 deduplicate.py *_private.csv
        """
    )
    
    parser.add_argument('files', nargs='+', help='CSV files to deduplicate')
    parser.add_argument(
        '--output', '-o',
        help='Output directory for deduplicated files (default: overwrite originals)',
        default=None
    )
    parser.add_argument(
        '--backup', '-b',
        action='store_true',
        help='Create .bak backup files before overwriting'
    )
    
    args = parser.parse_args()
    
    # Expand glob patterns if any
    csv_files = []
    for pattern in args.files:
        matching_files = list(Path('.').glob(pattern))
        if matching_files:
            csv_files.extend([str(f) for f in matching_files])
        else:
            csv_files.append(pattern)
    
    # Remove duplicates from file list itself
    csv_files = list(OrderedDict.fromkeys(csv_files))
    
    # Filter to only .csv files
    csv_files = [f for f in csv_files if f.endswith('.csv')]
    
    if not csv_files:
        print("❌ No CSV files found!")
        sys.exit(1)
    
    print(f"Found {len(csv_files)} CSV file(s) to process:")
    for f in csv_files:
        size = os.path.getsize(f) / 1024  # KB
        print(f"  • {os.path.basename(f)} ({size:.1f} KB)")
    
    # Confirm if overwriting
    if not args.output and not args.backup:
        response = input("\n⚠️  This will OVERWRITE the original files. Continue? (y/N): ").strip().lower()
        if response != 'y':
            print("Cancelled.")
            sys.exit(0)
    
    # Create backups if requested
    if args.backup and not args.output:
        print("\nCreating backups...")
        for f in csv_files:
            backup_path = f + '.bak'
            import shutil
            shutil.copy2(f, backup_path)
            print(f"  ✅ {os.path.basename(backup_path)}")
    
    # Perform deduplication
    stats = deduplicate_csvs(csv_files, args.output)
    
    # Print summary
    print_summary(stats)
    
    if args.output:
        print(f"✅ Deduplicated files saved to: {args.output}/")
    elif args.backup:
        print(f"✅ Original files backed up with .bak extension")
    else:
        print(f"✅ Original files have been overwritten")


if __name__ == '__main__':
    main()
