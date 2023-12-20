const express = require("express");
const app = express();
const cors = require("cors"); // Add this line
const port = process.env.PORT || 3001;
const path = require("path");

app.use(express.static(path.join(__dirname, "client/build")));

app.get("/", (req, res) => {
  // Serve your React app's HTML file or render a specific template
  res.sendFile(path.join(__dirname, "client/build/index.html"));
});

console.log("Starting server...");
// Rest of your server code...

const { fetchChannelData } = require("./youtubeService");
const {
  downloadAndConvertVideos,
  fetchVideosForConversion,
} = require("./downloadService");
const supabase = require("./supaBasenode");

const { Pool } = require("pg");
const pool = new Pool({
  connectionString:
    "postgresql://postgres:QuJmIQCO35uNC8pS@db.huzelhrvjaqhqldtnavm.supabase.co:5432/postgres",
});
// Enable All CORS Requests for development purposes
app.use(cors());
app.use(express.json());

app.post("/api/fetchChannel", async (req, res) => {
  try {
    const channelId = req.body.channelId;
    const channelData = await fetchChannelData(channelId);
    res.json(channelData);
  } catch (error) {
    console.error("Error fetching channel data", error);

    res.status(500).send("Error fetching channel data");
  }
});

app.post("/downloadVideos", async (req, res) => {
  console.log("Received request to download videos");

  try {
    const videosToDownload = await fetchVideosForConversion();
    await downloadAndConvertVideos(videosToDownload);
    res.status(200).send("Videos are being processed");
  } catch (error) {
    console.error("Error in downloadVideos:", error);
    res.status(500).send("Error processing videos");
  }
});

function formatTimestamp(timestamp) {
  // Subtract 2 seconds and ensure it doesn't go below zero
  const adjustedTimestamp = Math.max(0, timestamp - 2);
  const totalSeconds = Math.round(adjustedTimestamp); // Round to nearest second
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let timeString = "";
  if (hours > 0) timeString += `${hours}h`;
  if (minutes > 0 || hours > 0) timeString += `${minutes}m`;
  if (seconds > 0 || minutes > 0 || hours > 0) timeString += `${seconds}s`;

  return timeString;
}

function extractExcerpt(transcript, searchTerm) {
  // Convert both transcript and search term to lowercase for case-insensitive comparison
  const lowerCaseTranscript = transcript.toLowerCase();
  const lowerCaseSearchTerm = searchTerm.toLowerCase();

  // Regular expression to find the search term with word boundaries
  const regex = new RegExp(`\\b${lowerCaseSearchTerm}\\b`);

  const match = lowerCaseTranscript.match(regex);
  if (!match) return "Search term not found in transcript";

  // Find the position of the match in the transcript
  const matchIndex = match.index;

  // Define the number of characters to include before and after the search term
  const excerptLength = 100; // Adjust this number based on how long you want the excerpt to be

  // Calculate start and end positions for the excerpt
  const start = Math.max(0, matchIndex - excerptLength / 2);
  const end = Math.min(
    lowerCaseTranscript.length,
    matchIndex + excerptLength / 2
  );

  // Extract and return the excerpt
  return transcript.substring(start, end);
}

app.get("/api/search", async (req, res) => {
  const searchTerm = req.query.keyword.toLowerCase(); // Convert to lowercase for case-insensitive comparison
  console.log("Search term:", searchTerm);

  // Construct the query
  const query = `
    SELECT 
      yt.id AS yt_id,
      yt."VideoId" AS yt_videoId,
      yt."ChannelId",
      yt."Description",
      yt."PublishedAt",
      yt."ThumbnailUrl",
      yt."ChannelName",
      yt."Title",
      yt."VideoURL",
      trans.id AS trans_id,
      trans.created_at AS trans_created_at,
      trans."VideoId" AS trans_videoId,
      trans."Transcript",
      trans."Confidence",
      trans."Duration",
      trans."Words",
      word_obj
    FROM 
      transcriptions trans
    CROSS JOIN 
      LATERAL jsonb_array_elements(CAST(trans."Words" AS jsonb)) as word_obj
    INNER JOIN 
      "yt-videos" yt ON trans."VideoId" = yt.id
    WHERE 
      jsonb_typeof(CAST(trans."Words" AS jsonb)) = 'array' AND lower(word_obj ->> 'word') = $1`;

  try {
    // Execute the query
    const { rows } = await pool.query(query, [searchTerm]);
    console.log("Query Results:", rows);
    // console.log(`Row ${index}:`, row);
    // console.log(`Row ${index} VideoId:`, row.yt_videoId);
    // });

    // Process and send the response
    const processedData = rows.map((item) => {
      return {
        title: item.Title,
        channelName: item.ChannelName,
        publishedAt: item.PublishedAt,
        thumbnailUrl: item.ThumbnailUrl,
        videoId: item.yt_videoid,
        channelId: item.ChannelId,
        matchedWordDetails: item.word_obj,
        youtubeLink: `https://www.youtube.com/watch?v=${
          item.yt_videoid
        }&t=${formatTimestamp(item.word_obj.start)}`,
        transcriptExcerpt: extractExcerpt(item.Transcript, searchTerm),
        description: item.Description,
        videoURL: item.VideoURL,
      };
    });

    // console.log("Processed Data:", processedData);
    res.json(processedData);
  } catch (error) {
    console.error("Error executing search query:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at ${port}`);
});
