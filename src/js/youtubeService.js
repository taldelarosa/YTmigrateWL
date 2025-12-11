// src/js/youtubeService.js
import { Innertube } from "youtubei.js";

/**
 * Authenticates with YouTube using a provided cookie string.
 * @param {string} cookie - The YouTube cookie string.
 * @returns {Promise<Innertube>} An authenticated Innertube instance.
 */
export async function getAuthenticatedInstance(cookie) {
  console.log("\nAuthenticating with YouTube...");
  console.log("Cookie length:", cookie.length);
  
  // Check for brand account specific cookies
  const hasDelegatedSession = cookie.includes('DELEGATED_SESSION_ID');
  const hasPageId = cookie.toLowerCase().includes('pageid');
  
  console.log("Has DELEGATED_SESSION_ID cookie:", hasDelegatedSession);
  console.log("Has pageId in cookie:", hasPageId);
  
  if (!hasDelegatedSession && !hasPageId) {
    console.log("⚠️  WARNING: Cookie appears to be from a PERSONAL account, not a brand account!");
    console.log("⚠️  Brand account cookies typically contain DELEGATED_SESSION_ID");
    console.log("⚠️  Make sure you switch to your brand account BEFORE copying the cookie!");
  }
  
  const youtube = await Innertube.create({ 
    cookie,
    generate_session_locally: true
  });
  
  console.log("Authentication successful.");
  console.log("Session logged in:", youtube.session.logged_in);
  console.log("Session account:", youtube.session.account_name);
  
  return youtube;
}

/**
 * Gets all available channels/accounts for the authenticated user.
 * This includes both the personal Google account AND any brand accounts.
 * @param {Innertube} youtube - An authenticated Innertube instance.
 * @returns {Promise<Array>} An array of channel objects with id, name, and handle.
 */
export async function getAvailableChannels(youtube) {
  console.log("\n=== FETCHING AVAILABLE CHANNELS (Personal + Brand Accounts) ===");
  try {
    console.log("\nCalling youtube.account.getInfo(true) to get ALL accounts...");
    
    // Use getInfo(true) to get ALL accounts including brand accounts
    // This parameter is specifically for getting all accounts when using cookie auth
    const accountItems = await youtube.account.getInfo(true);
    
    console.log("\nRaw response from getInfo(true):");
    console.log(JSON.stringify(accountItems, null, 2));
    console.log(`\nType of response: ${Array.isArray(accountItems) ? 'Array' : typeof accountItems}`);
    console.log(`Number of items: ${accountItems ? accountItems.length : 0}`);
    
    // If we have account items, map them to include both personal and brand accounts
    if (accountItems && accountItems.length > 0) {
      const channels = accountItems.map((item, index) => {
        const name = item.account_name?.toString() || item.title?.toString() || `Account ${index + 1}`;
        const email = item.account_byline?.toString() || null;
        const handle = item.channel_handle?.toString() || null;
        const hasChannel = item.has_channel || false;
        const isSelected = item.is_selected || false;
        
        return {
          name,
          email,
          id: item.id || item.channel_id,
          handle,
          is_selected: isSelected,
          has_channel: hasChannel,
          is_brand_account: hasChannel, // Brand accounts have YouTube channels
          endpoint: item.endpoint,
          raw: item // Keep raw data for debugging
        };
      });
      
      console.log("\n=== PARSED ACCOUNTS ===");
      channels.forEach((ch, idx) => {
        console.log(`\n${idx + 1}. ${ch.name}`);
        console.log(`   Type: ${ch.is_brand_account ? 'Brand Account (YouTube Channel)' : 'Personal Google Account'}`);
        console.log(`   Email/Byline: ${ch.email || 'N/A'}`);
        console.log(`   Handle: ${ch.handle || 'N/A'}`);
        console.log(`   Currently Selected: ${ch.is_selected ? 'YES ⭐' : 'NO'}`);
      });
      
      return channels;
    }
    
    console.log("\n⚠️  getInfo(true) returned no accounts. This may indicate an issue with the cookie or API.");
    return [];
    
  } catch (error) {
    console.error("\n❌ Error fetching channels:", error.message);
    console.error("Full error:", error);
    console.error("Stack:", error.stack);
    return [];
  }
}

/**
 * Switches to a specific channel/account by name and returns fresh session.
 * Works with both personal Google accounts and brand accounts.
 * @param {Innertube} youtube - An authenticated Innertube instance.
 * @param {string} channelName - The name of the channel/account to switch to.
 * @param {string} cookie - The cookie string to re-authenticate with.
 * @returns {Promise<{success: boolean, youtube: Innertube|null}>} Success status and new youtube instance.
 */
export async function switchToChannel(youtube, channelName, cookie) {
  console.log(`\n=== ATTEMPTING TO SWITCH TO: "${channelName}" ===`);
  
  try {
    // Get all available channels (both personal and brand accounts)
    const channels = await getAvailableChannels(youtube);
    
    if (channels.length === 0) {
      console.log("❌ No accounts/channels found to switch to.");
      return { success: false, youtube: null };
    }
    
    // Find the matching channel (case-insensitive, check both name and handle)
    const targetChannel = channels.find(ch => 
      ch.name.toLowerCase() === channelName.toLowerCase() ||
      (ch.handle && ch.handle.toLowerCase() === channelName.toLowerCase()) ||
      (ch.handle && `@${ch.handle}`.toLowerCase() === channelName.toLowerCase())
    );
    
    if (!targetChannel) {
      console.log(`\n❌ "${channelName}" not found.`);
      console.log("\n📋 Available accounts/channels:");
      channels.forEach((ch, idx) => {
        console.log(`   ${idx + 1}. ${ch.name} ${ch.is_brand_account ? '(Brand/Channel)' : '(Personal)'}`);
        if (ch.handle) console.log(`      Handle: @${ch.handle}`);
      });
      return { success: false, youtube: null };
    }
    
    console.log(`\n✅ Found: ${targetChannel.name}`);
    console.log(`   Type: ${targetChannel.is_brand_account ? 'Brand Account (YouTube Channel)' : 'Personal Google Account'}`);
    console.log(`   Handle: ${targetChannel.handle || 'N/A'}`);
    
    // If already selected, no need to switch
    if (targetChannel.is_selected) {
      console.log("✅ This account is already selected!");
      return { success: true, youtube };
    }
    
    // Try to switch using the endpoint
    if (targetChannel.endpoint) {
      console.log("\n🔄 Switching account...");
      console.log("Endpoint details:");
      console.log("  Type:", targetChannel.endpoint.type);
      console.log("  Name:", targetChannel.endpoint.metadata?.name || targetChannel.endpoint.name);
      console.log("  Payload:", JSON.stringify(targetChannel.endpoint.payload, null, 2));
      
      try {
        // Try using the account manager's selectActiveIdentity method if available
        if (targetChannel.endpoint.payload?.supportedTokens) {
          const tokens = targetChannel.endpoint.payload.supportedTokens;
          console.log("\nAttempting to switch using supportedTokens...");
          
          // Extract the page ID from tokens
          const pageIdToken = tokens.find(t => t.pageIdToken);
          const pageId = pageIdToken?.pageIdToken?.pageId;
          
          console.log("Brand account page ID:", pageId);
          
          // Try calling the endpoint directly with the actions object
          const result = await youtube.actions.execute('/account/account_menu', {
            selectActiveIdentityEndpoint: targetChannel.endpoint.payload
          });
          
          console.log("Switch API result status:", result.success ? 'SUCCESS' : 'FAILED');
          
          if (result.success && pageId) {
            console.log("✅ Account switch API call succeeded!");
            
            // Try to manually update the session context with the delegated page ID
            console.log("🔧 Attempting to update session context with brand account page ID...");
            
            try {
              // Update the session context to include the delegated session ID
              if (youtube.session.context) {
                youtube.session.context.user = youtube.session.context.user || {};
                youtube.session.context.user.onBehalfOfUser = pageId;
                youtube.session.context.user.delegatedSessionId = pageId;
                
                console.log("✅ Session context updated with page ID:", pageId);
                console.log("Updated context:", JSON.stringify(youtube.session.context.user, null, 2));
              }
              
              return { success: true, youtube: youtube };
            } catch (error) {
              console.log("⚠️  Could not update session context:", error.message);
              console.log("Proceeding anyway with switched session...");
              return { success: true, youtube: youtube };
            }
          } else {
            console.log("❌ Account switch API call failed or no page ID found.");
            return { success: false, youtube: null };
          }
        } else {
          await targetChannel.endpoint.call(youtube.actions);
          console.log("✅ Account switched successfully!");
          
          // DON'T re-authenticate - use the existing session
          console.log("✅ Using the switched session (not re-authenticating to preserve state)");
          
          // Verify the switch
          console.log("\n🔍 Verifying account switch...");
          const verifyChannels = await getAvailableChannels(youtube);
          const nowSelected = verifyChannels.find(ch => ch.is_selected);
          
          console.log(`Currently selected account: ${nowSelected?.name || 'unknown'}`);
          console.log(`Target account: ${channelName}`);
          
          if (nowSelected && nowSelected.name.toLowerCase() === channelName.toLowerCase()) {
            console.log("✅ Verification successful - using switched account!");
            return { success: true, youtube: youtube }; // Return the SAME instance
          } else {
            console.log("⚠️  WARNING: Account switch verification failed!");
            return { success: false, youtube: null };
          }
        }
      } catch (error) {
        console.error("❌ Error switching account:", error.message);
        console.error("Full error:", error);
        
        // Try alternative method - directly posting to the account switch endpoint
        console.log("\n🔄 Trying alternative switching method...");
        try {
          const payload = targetChannel.endpoint.payload;
          if (payload && payload.supportedTokens) {
            // Use the actions API to manually send the switch request
            const response = await youtube.actions.session.http.fetch('/youtubei/v1/account/account_menu', {
              method: 'POST',
              body: JSON.stringify({
                context: youtube.actions.session.context,
                selectActiveIdentityEndpoint: payload
              })
            });
            console.log("Alternative method response:", response);
            console.log("✅ Account switched successfully via alternative method!");
            
            // Re-authenticate to get fresh session
            console.log("🔄 Re-authenticating with new account context...");
            await new Promise(resolve => setTimeout(resolve, 1500));
            const newYoutube = await getAuthenticatedInstance(cookie);
            return { success: true, youtube: newYoutube };
          }
        } catch (altError) {
          console.error("❌ Alternative method also failed:", altError.message);
        }
        
        return { success: false, youtube: null };
      }
    } else {
      console.log("⚠️  No endpoint available to switch account.");
      console.log("This account may not support switching via the API.");
      return { success: false, youtube: null };
    }
    
  } catch (error) {
    console.error("❌ Error in switchToChannel:", error.message);
    console.error("Full error:", error);
    return { success: false, youtube: null };
  }
}

/**
 * Creates a new playlist and adds the given videos to it.
 * @param {Innertube} youtube - An authenticated Innertube instance.
 * @param {string} playlistName - The name of the new playlist.
 * @param {string[]} videoIds - An array of video IDs to add.
 * @returns {Promise<string>} The URL of the created playlist.
 */
export async function createPlaylistWithVideos(
  youtube,
  playlistName,
  videoIds
) {
  console.log(`\n=== PLAYLIST CREATION DEBUG INFO ===`);
  console.log(`Playlist name: "${playlistName}"`);
  console.log(`Number of videos to add: ${videoIds.length}`);
  console.log(`First 5 video IDs: ${videoIds.slice(0, 5).join(', ')}`);
  console.log(`\nCreating new private playlist named: "${playlistName}"...`);
  
  try {
    const playlistDetails = await youtube.playlist.create(playlistName, videoIds);
    
    console.log(`\n=== PLAYLIST CREATION RESPONSE ===`);
    console.log('Full response:', JSON.stringify(playlistDetails, null, 2));
    
    const playlistId = playlistDetails.playlist_id;
    console.log(`\nExtracted playlist_id: ${playlistId}`);

    const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
    console.log(`\n✅ Playlist "${playlistName}" created successfully.`);
    console.log(`✅ Added ${videoIds.length} videos to the new playlist.`);
    
    return playlistUrl;
  } catch (error) {
    console.error(`\n❌ ERROR creating playlist:`);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

/**
 * Continuously fetches pages of ~100 videos from 'Watch Later' and removes them
 * until the playlist is empty.
 * @param {Innertube} youtube - An authenticated Innertube instance.
 */
export async function clearWatchLaterPlaylist(youtube) {
  let totalSuccessCount = 0;
  let iteration = 1;
  const DELAY_MS = 500;

  while (true) {
    try {
      console.log(
        `\n--- Iteration ${iteration}: Fetching the next page of videos... ---`
      );
      const playlist = await youtube.getPlaylist("WL");

      if (playlist.videos.length === 0) {
        console.log("\n'Watch Later' is now empty. Process complete.");
        break;
      }

      const videosToRemove = playlist.videos;
      const videoIdsToRemove = videosToRemove.map((video) => video.id);

      console.log(
        `Found ${videosToRemove.length} videos. Attempting removal...`
      );

      try {
        await youtube.playlist.removeVideos("WL", videoIdsToRemove);
        totalSuccessCount += videosToRemove.length;
        console.log(`✅ Successfully removed ${videosToRemove.length} videos.`);
      } catch (error) {
        console.error(
          `❌ Failed to remove page of videos | Reason: ${error.message}`
        );
        console.error("Aborting to prevent further issues.");
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      iteration++;
    } catch (error) {
      console.error(
        `\n❌ CRITICAL ERROR during fetch in iteration ${iteration}.`
      );
      console.error("Reason:", error.message);
      break;
    }
  }

  console.log(`\n\n--- FINAL SUMMARY ---`);
  console.log(`- Total videos successfully removed: ${totalSuccessCount}`);
  if (totalSuccessCount === 0 && iteration > 1) {
    console.log(
      "- It seems no videos were removed, despite multiple attempts."
    );
  }
}
