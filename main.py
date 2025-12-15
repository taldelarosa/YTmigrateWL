# main.py
import os
import re
import sys

import yt_dlp
from dotenv import load_dotenv

from src.fetcher import get_user_playlists, process_playlist_videos


def sanitize_filename(name: str) -> str:
    """Convert a playlist name to a safe filename."""
    # Remove or replace invalid characters
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    # Remove leading/trailing spaces and dots
    name = name.strip('. ')
    # Limit length
    return name[:100] if name else "playlist"


def select_playlists(browser: str, profile_path: str) -> list:
    """Allow user to select which playlists to export."""
    print("\n🔍 Fetching your playlists...")
    playlists = get_user_playlists(browser, profile_path)
    
    # Always include Watch Later as the default
    watch_later = {
        "id": "WL",
        "title": "Watch Later",
        "video_count": 0,  # Will be determined during processing
    }
    
    if not playlists:
        print("⚠️  Could not auto-fetch playlists.")
        print("\n" + "="*60)
        print("OPTIONS:")
        print("1. Press Enter to export Watch Later (default)")
        print("2. Type 'manual' to enter playlist URLs manually")
        print("="*60)
        
        choice = input("\nYour choice: ").strip().lower()
        
        if choice == "manual":
            return get_manual_playlists()
        else:
            return [watch_later]
    
    print(f"\n📋 Found {len(playlists)} playlist(s):\n")
    print("0. Watch Later (default)")
    for i, pl in enumerate(playlists, 1):
        count_str = f"({pl['video_count']} videos)" if pl['video_count'] else ""
        print(f"{i}. {pl['title']} {count_str}")
    
    print("\n" + "="*60)
    print("Enter playlist numbers to export (comma-separated)")
    print("Examples: '0' for Watch Later only")
    print("          '0,1,3' for Watch Later and playlists 1 and 3")
    print("          'all' to export all playlists")
    print("          'manual' to enter playlist URLs manually")
    print("Press Enter for Watch Later (default)")
    print("="*60)
    
    selection = input("\nYour selection: ").strip().lower()
    
    if not selection:
        return [watch_later]
    
    if selection == "manual":
        return get_manual_playlists()
    
    if selection == "all":
        return [watch_later] + playlists
    
    # Parse comma-separated indices
    selected = []
    try:
        indices = [int(x.strip()) for x in selection.split(',')]
        for idx in indices:
            if idx == 0:
                if watch_later not in selected:
                    selected.append(watch_later)
            elif 1 <= idx <= len(playlists):
                if playlists[idx - 1] not in selected:
                    selected.append(playlists[idx - 1])
            else:
                print(f"⚠️  Ignoring invalid index: {idx}")
    except ValueError:
        print("⚠️  Invalid input. Using Watch Later only.")
        return [watch_later]
    
    if not selected:
        print("⚠️  No valid selection. Using Watch Later only.")
        return [watch_later]
    
    return selected


def get_manual_playlists() -> list:
    """Allow user to manually enter playlist URLs."""
    playlists = []
    
    print("\n" + "="*60)
    print("MANUAL PLAYLIST ENTRY")
    print("="*60)
    print("Enter playlist URLs one at a time.")
    print("Examples:")
    print("  - https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxx")
    print("  - https://www.youtube.com/watch?v=xxxxx&list=PLxxxxxxxx")
    print("\nType 'done' when finished.")
    print("="*60 + "\n")
    
    while True:
        url = input("Enter playlist URL (or 'done'): ").strip()
        
        if url.lower() == "done":
            break
        
        if not url:
            continue
        
        # Extract playlist ID from URL
        playlist_id = None
        if "list=" in url:
            try:
                playlist_id = url.split("list=")[1].split("&")[0]
            except:
                print("⚠️  Could not extract playlist ID from URL. Try again.")
                continue
        else:
            print("⚠️  Invalid URL format. Must contain 'list=' parameter.")
            continue
        
        # Ask for a custom name
        custom_name = input(f"  Enter a name for this playlist (or press Enter for 'Playlist_{len(playlists)+1}'): ").strip()
        if not custom_name:
            custom_name = f"Playlist_{len(playlists)+1}"
        
        playlists.append({
            "id": playlist_id,
            "title": custom_name,
            "video_count": 0,
        })
        print(f"  ✅ Added: {custom_name}\n")
    
    if not playlists:
        print("⚠️  No playlists entered. Using Watch Later only.")
        return [{
            "id": "WL",
            "title": "Watch Later",
            "video_count": 0,
        }]
    
    return playlists


def main():
    """Main function to run the video fetching and saving process."""
    load_dotenv()

    # --- Configuration from .env ---
    browser = os.getenv("BROWSER", "").lower()
    
    # Check if user wants CSV only mode
    csv_only = os.getenv("CSV_ONLY", "false").lower() in ["true", "1", "yes"]

    # --- Validate Browser and Get Optional Profile Path ---
    supported_browsers = ["firefox", "chrome"]
    if not browser or browser not in supported_browsers:
        print("ERROR: You must set a valid BROWSER in your .env file.", file=sys.stderr)
        print(
            f"Supported browsers are: {', '.join(supported_browsers)}", file=sys.stderr
        )
        sys.exit(1)

    profile_path = os.getenv(f"{browser.upper()}_PROFILE_PATH")

    # --- Process all videos in the playlist ---
    try:
        print(
            f"Starting the process to fetch videos using {browser.capitalize()} cookies..."
        )
        if profile_path:
            print(f"Using specified profile path: {profile_path}")
        else:
            print("Using default browser profile.")

        # Let user select playlists
        selected_playlists = select_playlists(browser, profile_path)
        
        print(f"\n📦 Exporting {len(selected_playlists)} playlist(s)...\n")
        
        exported_files = []
        
        for playlist in selected_playlists:
            playlist_id = playlist["id"]
            playlist_title = playlist["title"]
            
            # Generate filenames based on playlist name
            safe_name = sanitize_filename(playlist_title)
            csv_filename = f"{safe_name}_public.csv"
            csv_filename_private = f"{safe_name}_private.csv"
            
            # Build playlist URL
            playlist_url = f"https://www.youtube.com/playlist?list={playlist_id}"
            
            print(f"\n{'='*60}")
            print(f"Processing: {playlist_title}")
            print(f"{'='*60}")
            
            process_playlist_videos(
                browser=browser,
                profile_path=profile_path,
                output_filename=csv_filename,
                private_output_filename=csv_filename_private,
                playlist_url=playlist_url,
                playlist_name=playlist_title,
            )
            
            exported_files.append((csv_filename, csv_filename_private))
        
        if csv_only:
            print("\n" + "="*60)
            print("✅ CSV files generated successfully!")
            print("="*60)
            for public, private in exported_files:
                print(f"   📄 {public}")
                if os.path.exists(private) and os.path.getsize(private) > 50:
                    print(f"   📄 {private}")
            print("\n⚠️  CSV_ONLY mode: Skipping playlist creation and deletion.")
            print("   To create playlists, set CSV_ONLY=false in .env and run the Node.js script.")
            sys.exit(0)

    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user. Exiting gracefully.")
        sys.exit(0)

    except yt_dlp.utils.DownloadError as e:
        print(
            f"\n❌ CRITICAL ERROR: Could not fetch the YouTube playlist using {browser.capitalize()} cookies.",
            file=sys.stderr,
        )
        print(f"   yt-dlp error: {e}", file=sys.stderr)
        print("\n--- Common Solutions ---", file=sys.stderr)
        print(
            f"1. Ensure your browser ({browser.capitalize()}) is completely closed.",
            file=sys.stderr,
        )
        print(
            f"2. Make sure you are logged into YouTube in the correct {browser.capitalize()} profile.",
            file=sys.stderr,
        )
        print(
            "3. If you use a non-default profile, ensure the correct profile path is set in your .env file.",
            file=sys.stderr,
        )
        sys.exit(1)

    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
