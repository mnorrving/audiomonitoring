const { createClient } = require("@supabase/supabase-js");
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1emVsaHJ2amFxaHFsZHRuYXZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDE4MDg3MjgsImV4cCI6MjAxNzM4NDcyOH0.ANdjKRfw-KUssIgCkq234WmeRpfns6cO0C2ZvQUQV_w";
const supabaseUrl = "https://huzelhrvjaqhqldtnavm.supabase.co";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// console.log("Supabase URL:", supabaseUrl);
// console.log("Supabase Client:", supabase);

const RSSParser = require("rss-parser");
const parser = new RSSParser();

class PodcastManagerAdd {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    console.log(
      "Supabase Client in PodcastManagerAdd constructor:",
      this.supabase
    );
  }

  async addPodcastFromRSS(rssUrl) {
    console.log("Starting to add podcast from RSS", rssUrl);

    try {
      // Parse the RSS feed
      const feed = await parser.parseURL(rssUrl);
      //   console.log("Parsed RSS Feed:", feed);

      // Extract podcast channel details
      const podcastData = {
        acastChannelId: feed.acast?.showId,
        Title: feed.title,
        Link: feed.link,
        Language: feed.language,
        Copyright: feed.copyright,
        Author: feed["itunes:author"],
        Description: feed.description || feed["itunes:summary"],
        ExplicitContent: feed["itunes:explicit"] === "yes" ? true : false,
        ImageURL: feed["itunes:image"]?.href || feed.image?.url,
        RSSUrl: rssUrl,
        Email: feed["itunes:email"],
        ShowURL: `https://acast.com/${feed.acast?.showUrl}`, // Constructed URL, modify as needed
      };

      // Insert podcast channel into podcast_channels table
      console.log("Inserting podcast channel into database");

      const { data: podcastChannel, error: podcastChannelError } =
        await this.supabase
          .from("podcast_channels")
          .insert([podcastData])
          .select();

      if (podcastChannelError) {
        console.error("Error inserting podcast channel:", podcastChannelError);
        throw podcastChannelError;
      }

      if (!podcastChannel || podcastChannel.length === 0) {
        throw new Error("Podcast channel insert returned no data");
      }
      // Extract and insert episodes
      for (const item of feed.items) {
        const episodeDetails = {
          podcast_channel_id: podcastChannel[0].id,
          title: item.title,
          description: item["itunes:summary"] || item.description,
          link: item.link,
          audiolink: item.enclosure.url,
          //   duration: this.parseDuration(item["itunes:duration"]),
          Processed: false,
          podcast_name: feed.title,
        };
        // console.log("Inserting episode into database", episodeDetails);
        console.log("Supabase Client in PodcastManagerAdd:", this.supabase);

        const { error: episodeError } = await this.supabase
          .from("podcast_episodes")
          .insert([episodeDetails]);

        if (episodeError) throw episodeError;
      }

      console.log(`Podcast and episodes added: ${feed.title}`);
    } catch (error) {
      console.error("Error occurred in addPodcastFromRSS:");
      console.error(error);

      // Log the properties of the error object, if it exists
      if (error && typeof error === "object") {
        Object.entries(error).forEach(([key, value]) => {
          console.log(`${key}: ${value}`);
        });
      }
    }
  }

  parseDuration(durationStr) {
    // Convert 'HH:MM:SS' format to seconds
    const parts = durationStr.split(":").map((part) => parseInt(part, 10));
    let seconds = 0;
    if (parts.length === 3) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      seconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 1) {
      seconds = parts[0];
    }
    return seconds;
  }
}

module.exports = PodcastManagerAdd;
