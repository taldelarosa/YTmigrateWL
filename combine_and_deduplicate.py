#!/usr/bin/env python3
"""
Combine multiple CSV files into one and remove duplicate video IDs.
Keeps the first occurrence of each video ID.
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
        try:
            header = next(reader)
            rows = list(reader)
            return header, rows
        except StopIteration:
            return None, []


def combine_and_deduplicate(csv_files, output_file='combined.csv'):
    """
    Combine multiple CSV files into one and remove duplicate video IDs.
    
    Args:
        csv_files: List of CSV file paths
        output_file: Output filename for combined CSV
    
    Returns:
        Dictionary with statistics
    """
    # Track seen video IDs to avoid duplicates
    seen_video_ids = OrderedDict()  # Maps video_id -> (video_id, title)
    
    stats = {
        'total_files': len(csv_files),
        'total_videos_read': 0,
        'unique_videos': 0,
        'duplicates_skipped': 0,
        'files_processed': []
    }
    
    header = None
    
    print(f"\n{'='*60}")
    print("COMBINING AND DEDUPLICATING CSV FILES")
    print(f"{'='*60}\n")
    
    for csv_file in csv_files:
        if not os.path.exists(csv_file):
            print(f"⚠️  Warning: File not found: {csv_file}")
            continue
        
        filename = os.path.basename(csv_file)
        print(f"Reading: {filename}")
        
        try:
            # Read the CSV
            file_header, rows = read_csv_with_header(csv_file)
            
            if file_header is None:
                print(f"  ⚠️  Empty or invalid file, skipping\n")
                continue
            
            # Use the first file's header
            if header is None:
                header = file_header
            
            if not rows:
                print(f"  → No data rows, skipping\n")
                continue
            
            original_count = len(rows)
            new_videos = 0
            duplicates = 0
            
            for row in rows:
                if not row:  # Skip empty rows
                    continue
                
                stats['total_videos_read'] += 1
                video_id = row[0]  # ID is first column
                
                if video_id not in seen_video_ids:
                    seen_video_ids[video_id] = row
                    new_videos += 1
                else:
                    duplicates += 1
            
            stats['duplicates_skipped'] += duplicates
            stats['files_processed'].append({
                'filename': filename,
                'total_rows': original_count,
                'new_videos': new_videos,
                'duplicates': duplicates
            })
            
            print(f"  ✅ {original_count} rows ({new_videos} new, {duplicates} duplicates)")
            print()
            
        except Exception as e:
            print(f"  ❌ Error processing {filename}: {e}\n")
            continue
    
    stats['unique_videos'] = len(seen_video_ids)
    
    # Write combined CSV
    if header and seen_video_ids:
        print(f"Writing combined file: {output_file}")
        with open(output_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(header)
            writer.writerows(seen_video_ids.values())
        print(f"✅ Wrote {stats['unique_videos']} unique videos\n")
    else:
        print("❌ No data to write!\n")
    
    return stats


def print_summary(stats, output_file):
    """Print a summary of the combination results."""
    print(f"{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"Files processed: {stats['total_files']}")
    print(f"Total videos read: {stats['total_videos_read']}")
    print(f"Unique videos: {stats['unique_videos']}")
    print(f"Duplicates skipped: {stats['duplicates_skipped']}")
    print(f"{'='*60}\n")
    
    if stats['files_processed']:
        print("Per-file breakdown:")
        for file_stat in stats['files_processed']:
            print(f"  📄 {file_stat['filename']}: "
                  f"{file_stat['total_rows']} rows "
                  f"({file_stat['new_videos']} new, {file_stat['duplicates']} duplicates)")
        print()
    
    print(f"✅ Combined CSV saved as: {output_file}")
    size_kb = os.path.getsize(output_file) / 1024
    print(f"   File size: {size_kb:.1f} KB\n")


def main():
    """Main function."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Combine multiple CSV files and remove duplicate video IDs',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Combine all CSV files
  python3 combine_and_deduplicate.py *.csv
  
  # Combine only public files
  python3 combine_and_deduplicate.py *_public.csv
  
  # Combine only private files
  python3 combine_and_deduplicate.py *_private.csv -o combined_private.csv
  
  # Combine specific files with custom output name
  python3 combine_and_deduplicate.py wl2_public.csv wl3_public.csv -o my_videos.csv
        """
    )
    
    parser.add_argument('files', nargs='+', help='CSV files to combine')
    parser.add_argument(
        '--output', '-o',
        help='Output filename (default: combined.csv)',
        default='combined.csv'
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
    
    # Remove duplicates from file list itself and preserve order
    csv_files = list(OrderedDict.fromkeys(csv_files))
    
    # Filter to only .csv files
    csv_files = [f for f in csv_files if f.endswith('.csv')]
    
    if not csv_files:
        print("❌ No CSV files found!")
        sys.exit(1)
    
    print(f"Found {len(csv_files)} CSV file(s) to combine:")
    for f in csv_files:
        if os.path.exists(f):
            size = os.path.getsize(f) / 1024  # KB
            print(f"  • {os.path.basename(f)} ({size:.1f} KB)")
        else:
            print(f"  • {os.path.basename(f)} (NOT FOUND)")
    
    # Check if output file already exists
    if os.path.exists(args.output):
        response = input(f"\n⚠️  '{args.output}' already exists. Overwrite? (y/N): ").strip().lower()
        if response != 'y':
            print("Cancelled.")
            sys.exit(0)
    
    # Perform combination and deduplication
    stats = combine_and_deduplicate(csv_files, args.output)
    
    # Print summary
    print_summary(stats, args.output)


if __name__ == '__main__':
    main()
