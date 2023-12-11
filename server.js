const express = require("express");
const app = express();
const cors = require("cors"); // Add this line
const port = process.env.PORT || 3001;

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
  const totalSeconds = Math.round(timestamp); // Round to nearest second
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
  const words = transcript.split(/\s+/); // Split transcript into words
  const index = words.findIndex((word) => word.includes(searchTerm));

  if (index === -1) return "Search term not found in transcript";

  const start = Math.max(0, index - 10); // Ensure start is not negative
  const end = Math.min(words.length, index + 11); // Ensure end does not exceed array length

  return words.slice(start, end).join(" ");
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

    // Process and send the response
    const processedData = rows.map((item) => {
      return {
        title: item.Title,
        publishedAt: item.PublishedAt,
        thumbnailUrl: item.ThumbnailUrl,
        videoId: item.yt_videoId,
        channelId: item.ChannelId,
        matchedWordDetails: item.word_obj,
        youtubeLink: `https://www.youtube.com/watch?v=${
          item.yt_videoId
        }&t=${formatTimestamp(item.word_obj.start)}`,
        transcriptExcerpt: extractExcerpt(item.Transcript, searchTerm),
        description: item.Description,
        videoURL: item.VideoURL,
      };
    });

    console.log("Processed Data:", processedData);
    res.json(processedData);
  } catch (error) {
    console.error("Error executing search query:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
