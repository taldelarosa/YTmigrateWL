// src/js/index.js
import "dotenv/config";
import readline from "readline";
import { getVideoIdsFromCsv } from "./csvReader.js";
import {
  clearWatchLaterPlaylist,
  createPlaylistWithVideos,
  getAuthenticatedInstance,
  getAvailableChannels,
  switchToChannel,
} from "./youtubeService.js";

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function generatePlaylistName() {
  const today = new Date();
  const dateString = today.toISOString().split("T")[0]; // YYYY-MM-DD
  return `WL_${dateString}`;
}

async function main() {
  console.log("Starting the playlist migration process...");

  const publicCsvPath = process.env.CSV_FILENAME;
  if (!publicCsvPath) {
    console.error("ERROR: CSV_FILENAME is not defined in your .env file.");
    return;
  }

  try {
    // Step 1: Read public video IDs to create the new playlist.
    const publicVideoIds = await getVideoIdsFromCsv(publicCsvPath).catch(
      () => []
    );

    if (publicVideoIds.length === 0) {
      console.log(`No videos found in '${publicCsvPath}' to migrate.`);
      console.log(
        "You can still proceed to clear your Watch Later if you wish."
      );
    }

    // Step 2: Get user's cookie for authentication.
    console.log("\n=== COOKIE AUTHENTICATION INSTRUCTIONS ===");
    console.log("⚠️  IMPORTANT: If you want to use a BRAND ACCOUNT (not your personal account):");
    console.log("   1. Open YouTube in your browser");
    console.log("   2. Click your profile icon in the top-right");
    console.log("   3. Select 'Switch account' and choose your BRAND ACCOUNT");
    console.log("   4. Verify you're on the correct account (check the name in top-right)");
    console.log("   5. Visit a page like youtube.com/feed/you to ensure session is established");
    console.log("");
    console.log("Then to get your cookie:");
    console.log("1. Open DevTools (F12)");
    console.log("2. Go to the Application/Storage tab");
    console.log("3. Click 'Cookies' > 'https://www.youtube.com'");
    console.log("4. Look for these important cookies and verify values:");
    console.log("   - DELEGATED_SESSION_ID (if present, you're on a brand account)");
    console.log("   - SID, __Secure-1PSID, __Secure-3PSID");
    console.log("5. Then go to Network tab, refresh, click any youtube.com request");
    console.log("6. Copy the ENTIRE 'Cookie' header value");
    console.log("");
    console.log("⚠️  The cookie MUST be from while you're actively on the brand account!\n");
    
    const userCookie = await prompt(
      "Please paste your FULL YouTube cookie string and press Enter:\n> "
    );
    if (!userCookie) {
      console.error("A cookie is required to proceed. Exiting.");
      return;
    }
    let youtube = await getAuthenticatedInstance(userCookie);

    // Step 2.5: Check what account we're authenticated as
    console.log("\n=== CHECKING AUTHENTICATED ACCOUNT ===");
    const initialChannels = await getAvailableChannels(youtube);
    const currentlySelected = initialChannels.find(ch => ch.is_selected);
    
    if (currentlySelected) {
      console.log(`\n✅ Authenticated as: ${currentlySelected.name}`);
      console.log(`   Type: ${currentlySelected.is_brand_account ? 'Brand Account (YouTube Channel)' : 'Personal Google Account'}`);
      if (currentlySelected.handle) {
        console.log(`   Handle: @${currentlySelected.handle}`);
      }
    }

    // Check for target channel and switch if specified
    const targetChannelName = process.env.TARGET_CHANNEL;
    
    if (targetChannelName && targetChannelName.trim() !== "") {
      console.log(`\nTarget channel specified: "${targetChannelName}"`);
      const result = await switchToChannel(youtube, targetChannelName.trim(), userCookie);
      
      if (result.success && result.youtube) {
        youtube = result.youtube; // Use the new authenticated instance
        console.log("✅ Ready to create playlist on the selected channel.\n");
      } else {
        const continueAnyway = await prompt(
          "\n⚠️  Failed to switch to the specified channel. Continue with current account? (y/n): "
        );
        if (continueAnyway.toLowerCase() !== 'y' && continueAnyway.toLowerCase() !== 'yes') {
          console.log("Exiting.");
          return;
        }
      }
    } else {
      // No target channel specified - fetch all and let user choose
      console.log("\nNo TARGET_CHANNEL specified in .env file.");
      console.log("Fetching all available accounts (personal + brand accounts)...\n");
      
      const channels = await getAvailableChannels(youtube);
      
      if (channels.length > 1) {
        console.log("\n=== AVAILABLE ACCOUNTS ===");
        channels.forEach((ch, idx) => {
          const type = ch.is_brand_account ? '[Brand Account/Channel]' : '[Personal Account]';
          const selected = ch.is_selected ? ' ⭐ CURRENT' : '';
          console.log(`${idx + 1}. ${ch.name} ${type}${selected}`);
          if (ch.handle) console.log(`   Handle: @${ch.handle}`);
          if (ch.email) console.log(`   ${ch.email}`);
        });
        
        const choice = await prompt(
          `\nSelect which account to use for the playlist (1-${channels.length}), or press Enter to use current: `
        );
        
        if (choice.trim() !== "") {
          const selectedIndex = parseInt(choice) - 1;
          if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= channels.length) {
            console.error("Invalid selection. Exiting.");
            return;
          }
          
          const selectedChannel = channels[selectedIndex];
          console.log(`\nSelected: ${selectedChannel.name}`);
          
          if (!selectedChannel.is_selected) {
            const result = await switchToChannel(youtube, selectedChannel.name, userCookie);
            if (!result.success || !result.youtube) {
              console.error("\n❌ Failed to switch to the selected account.");
              console.error("Cannot proceed - playlist would be created on the wrong account.");
              console.error("Exiting to prevent mistakes.");
              return;
            }
            
            youtube = result.youtube; // Use the new authenticated instance
            console.log("✅ Ready to create playlist on the selected account.\n");
          }
        } else {
          console.log("\nUsing currently selected account.\n");
        }
      } else if (channels.length === 1) {
        console.log(`✅ Using account: ${channels[0].name}\n`);
      } else {
        console.log("⚠️  No accounts detected. Proceeding with current session...\n");
      }
    }

    // Step 3: Create the new playlist if there are videos to migrate.
    if (publicVideoIds.length > 0) {
      const reversedPublicIds = [...publicVideoIds].reverse();
      const playlistName = generatePlaylistName();
      await createPlaylistWithVideos(youtube, playlistName, reversedPublicIds);
    }

    // Step 4: Ask for confirmation to clear the ENTIRE 'Watch Later' playlist.
    // COMMENTED OUT FOR TESTING - Just creating the new playlist
    /*
    const confirmation = await prompt(
      `\nDo you want to clear your ENTIRE 'Watch Later' playlist now? (y/n): `
    );

    const affirmativeAnswers = ["yes", "y"];
    if (!affirmativeAnswers.includes(confirmation.toLowerCase())) {
      console.log(
        "Skipping the 'Watch Later' playlist clearing step."
      );
    } else {
      // Step 5: If confirmed, clear the playlist.
      await clearWatchLaterPlaylist(youtube);
    }
    */

    console.log("\n✅ --- SCRIPT COMPLETE --- ✅");
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(`\n❌ --- FILE NOT FOUND --- ❌`);
      console.error(`Error: The file '${publicCsvPath}' was not found.`);
      console.error("Please ensure you have run the Python script first.");
    } else {
      console.error("\n❌ --- AN ERROR OCCURRED --- ❌");
      console.error("Error details:", error.message);
    }
  }
}

main();
