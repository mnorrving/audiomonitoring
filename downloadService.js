const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
const { exec } = require("child_process");
const { createClient: createDeepgramClient } = require("@deepgram/sdk");
const path = require("path");
const { spawn } = require("child_process");

const supabaseUrl = "https://huzelhrvjaqhqldtnavm.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1emVsaHJ2amFxaHFsZHRuYXZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDE4MDg3MjgsImV4cCI6MjAxNzM4NDcyOH0.ANdjKRfw-KUssIgCkq234WmeRpfns6cO0C2ZvQUQV_w";
const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

const parseDownloadedPath = (stdout) => {
  console.log("stdout", stdout);
  const lines = stdout.split("\n");
  const downloadLine = lines.find((line) =>
    line.includes("[download] Destination:")
  );
  if (downloadLine) {
    return downloadLine.split("[download] Destination:")[1].trim();
  }
  return null; // Or handle this case as you see fit
};

const updateVideoPathInDatabase = async (videoId, videoPath) => {
  try {
    const { data, error } = await supabase
      .from("yt-videos")
      .update({
        VideoURL: videoPath,
        Processed: true, // Update the Processed field to true
      })
      .match({ id: videoId });

    if (error) {
      console.error("Error updating video path in database:", error);
      throw error;
    }

    console.log("Database update successful for ID:", videoId, "Data:", data);
    return data;
  } catch (error) {
    console.error("Error in updateVideoPathInDatabase function:", error);
    throw error;
  }
};

const storeTranscriptionResults = async (videoId, deepgramResponse) => {
  try {
    if (
      !deepgramResponse ||
      !deepgramResponse.results ||
      !deepgramResponse.results.channels ||
      !deepgramResponse.results.channels[0]
    ) {
      throw new Error("Invalid transcription response structure.");
    }

    const channelData = deepgramResponse.results.channels[0];
    if (!channelData.alternatives || !channelData.alternatives[0]) {
      throw new Error("No transcription alternatives found.");
    }

    const transcription = channelData.alternatives[0];
    const transcript = transcription.transcript || "";
    const confidence = transcription.confidence || 0;
    const created = deepgramResponse.metadata.created || new Date();
    const duration = deepgramResponse.metadata.duration || 0;

    // Reformat each word object to ensure 'end' appears first
    const reformattedWords = transcription.words.map((word) => ({
      end: word.end,
      word: word.word,
      start: word.start,
      confidence: word.confidence,
      punctuated_word: word.punctuated_word,
    }));

    console.log("Storing transcription results for video ID:", videoId);
    console.log("Transcript data:", {
      VideoID: videoId,
      Transcript: transcript,
      Confidence: confidence,
      Created: new Date(created),
      Duration: duration,
      Words: reformattedWords, // Use reformattedWords here
    });

    const { data, error } = await supabase.from("transcriptions").insert([
      {
        VideoId: videoId,
        Transcript: transcript,
        Confidence: confidence,
        Duration: duration,
        Words: reformattedWords, // Insert the actual array directly
      },
    ]);

    if (error) {
      console.error("Error storing transcription results:", error);
      throw error;
    } else {
      console.log("Successfully stored transcription results:", data);
    }
  } catch (error) {
    console.error("Error in storeTranscriptionResults function:", error);
    throw error;
  }
};

const fs = require("fs");

const transcribeVideo = async (filePath) => {
  const deepgramApiKey = "c159d27be69405b1c2f5dc630e5e3fcc034cfdda"; // Replace with your Deepgram API key

  const deepgram = createDeepgramClient(deepgramApiKey);

  console.log("Requesting transcript...");
  console.log("Your file may take up to a couple minutes to process.");

  const maxRetries = 3; // Maximum number of retries
  let currentAttempt = 0;

  while (currentAttempt < maxRetries) {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      console.log(
        `Attempt ${
          currentAttempt + 1
        }: Sending file to Deepgram for transcription:`,
        filePath
      );

      const { result, error } =
        await deepgram.listen.prerecorded.transcribeFile(
          fileBuffer,
          { punctuate: true, model: "enhanced", language: "sv" } // Adjust options as needed
        );

      if (error) {
        console.error("Error during transcription:", error);
        throw error;
      }

      console.log("Transcription result:", result);
      return result;
    } catch (error) {
      console.error(
        `Error in transcribeVideo function on attempt ${currentAttempt + 1}:`,
        error
      );
      currentAttempt++;

      if (currentAttempt >= maxRetries) {
        console.error("Maximum retry attempts reached.");
        throw error;
      }

      // Optionally, add a delay before retrying
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2-second delay
    }
  }
};

const fetchVideosForConversion = async () => {
  console.log("Fetching videos for conversion...");

  let { data: videos, error } = await supabase
    .from("yt-videos")
    .select("*")
    .is("Processed", null);

  if (error) {
    console.error("Error fetching videos for conversion:", error);
    return [];
  }

  console.log(`Fetched ${videos.length} videos for conversion.`);
  return videos;
};

const downloadVideoWithYtDlp = (videoUrl, localFilePath) => {
  return new Promise((resolve, reject) => {
    // Use the -f option with the desired audio-only format code
    const ytDlpProcess = spawn("yt-dlp", [
      "-f",
      "140",
      videoUrl,
      "-o",
      localFilePath,
    ]);

    ytDlpProcess.on("close", (code) => {
      if (code !== 0) {
        console.error(`yt-dlp exited with code ${code}`);
        reject(`yt-dlp exited with code ${code}`);
      } else {
        console.log("Download complete:", localFilePath);
        resolve(localFilePath);
      }
    });

    ytDlpProcess.stderr.on("data", (data) => {
      console.error(`yt-dlp stderr: ${data}`);
    });
  });
};

let downloadCounter = 1;

const downloadAndConvertVideos = async (videos) => {
  console.log(`Starting to process ${videos.length} videos...`);

  for (const video of videos) {
    console.log(`Processing video ID: ${video.VideoId}`);

    try {
      const videoUrl = `https://www.youtube.com/watch?v=${video.VideoId}`;
      const filename = `${downloadCounter++}.mp3`; // Changed to .mp3
      const audioFilePath = path.join(__dirname, "..", "downloads", filename);

      console.log(`Downloading audio from URL: ${videoUrl}`);
      await downloadVideoWithYtDlp(videoUrl, audioFilePath);
      console.log(`Audio downloaded to: ${audioFilePath}`);

      await updateVideoPathInDatabase(video.id, audioFilePath);

      console.log(`Transcribing audio from file: ${audioFilePath}`);
      const transcriptionResult = await transcribeVideo(audioFilePath);
      console.log(`Transcription completed for video ID: ${video.id}`);

      await storeTranscriptionResults(video.id, transcriptionResult);

      fs.unlinkSync(audioFilePath); // Only deleting the audio file
      console.log(`Deleted local file: ${audioFilePath}`);
    } catch (error) {
      console.error("Error processing video ID: ", video.VideoId, error);
      // Optionally, delete the file in case of an error
    }
  }

  console.log("Finished processing videos.");
};

module.exports = {
  fetchVideosForConversion,
  downloadAndConvertVideos,
};
