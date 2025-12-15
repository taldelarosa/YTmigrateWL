# How to Export Multiple Playlists

## Quick Start

Run the script:
```bash
python3 main.py
```

## Option 1: Auto-fetch playlists (if it works)

If the script successfully fetches your playlists, you'll see a numbered list:
```
📋 Found 5 playlist(s):

0. Watch Later (default)
1. Favorites (25 videos)
2. Music (100 videos)
3. Tutorials (15 videos)
4. Watch Again (50 videos)
```

Then you can:
- Press **Enter** → Export Watch Later only
- Type **0,1,3** → Export Watch Later, Favorites, and Tutorials
- Type **all** → Export all playlists
- Type **manual** → Enter URLs manually

## Option 2: Manual entry (when auto-fetch fails)

If auto-fetch fails, you'll see:
```
⚠️  Could not auto-fetch playlists.

OPTIONS:
1. Press Enter to export Watch Later (default)
2. Type 'manual' to enter playlist URLs manually
```

### To use manual mode:

1. Type **manual** and press Enter

2. Find your playlist URLs on YouTube:
   - Go to YouTube
   - Navigate to your playlist
   - Copy the URL (it looks like: `https://www.youtube.com/playlist?list=PLxxxxxxxxxx`)

3. Enter each playlist URL when prompted:
```
Enter playlist URL (or 'done'): https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf
  Enter a name for this playlist (or press Enter for 'Playlist_1'): My Coding Tutorials
  ✅ Added: My Coding Tutorials

Enter playlist URL (or 'done'): https://www.youtube.com/playlist?list=PLxxxxxx
  Enter a name for this playlist (or press Enter for 'Playlist_2'): Music Collection
  ✅ Added: Music Collection

Enter playlist URL (or 'done'): done
```

4. The script will export each playlist to separate CSV files:
   - `My Coding Tutorials_public.csv`
   - `My Coding Tutorials_private.csv` (if any private videos)
   - `Music Collection_public.csv`
   - `Music Collection_private.csv` (if any private videos)

## Notes

- Each playlist gets its own CSV file
- Private videos are separated into `*_private.csv` files
- Special characters in playlist names are converted to underscores
- Watch Later is always available even if auto-fetch fails
