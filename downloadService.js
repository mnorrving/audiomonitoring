const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
const { exec } = require("child_process");
const { createClient: createDeepgramClient } = require("@deepgram/sdk");
const path = require("path");
// const fs = require("fs");

const { Storage } = require("@google-cloud/storage");

// Replace with the path to your downloaded JSON key file
const keyFilename = "./audio-extraction-407220-a6a2475a0717";

// Initialize Google Cloud Storage client
const storage = new Storage({ keyFilename });

// Your Google Cloud Storage bucket name
const bucketName = "audio-extraction";

const uploadToGoogleCloud = async (filePath, filename) => {
  await storage.bucket(bucketName).upload(filePath, {
    destination: filename,
  });
  return `gs://${bucketName}/${filename}`;
};

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
      .update({ VideoURL: videoPath })
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
    const words = transcription.words
      ? JSON.stringify(transcription.words)
      : "[]";

    console.log("Storing transcription results for video ID:", videoId);
    console.log("Transcript data:", {
      VideoID: videoId,
      Transcript: transcript,
      Confidence: confidence,
      Created: new Date(created),
      Duration: duration,
      Words: words,
    });

    const { data, error } = await supabase.from("transcriptions").insert([
      {
        VideoId: videoId,
        Transcript: transcript,
        Confidence: confidence,
        Duration: duration,
        Words: words,
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

  try {
    const fileBuffer = fs.readFileSync(filePath);

    console.log("Sending file to Deepgram for transcription:", filePath);
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
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
    console.error("Error in transcribeVideo function:", error);
    throw error;
  }
};

const fetchVideosForConversion = async () => {
  let { data: videos, error } = await supabase
    .from("yt-videos")
    .select("*") // Select all fields, or specify the fields you need
    .is("MP3URL", null);

  if (error) {
    console.error("Error fetching videos for conversion:", error);
    return [];
  }

  return videos; // This will be an array of videos with MP3URL set to NULL
  console.log("videos", videos);
};

let downloadCounter = 1;

const downloadAndConvertVideos = async (videos) => {
  for (const video of videos) {
    const videoUrl = `https://www.youtube.com/watch?v=${video.VideoId}`;
    try {
      await new Promise((resolve, reject) => {
        const filename = `${downloadCounter++}.mp4`; // Incremental filename
        const localFilePath = `../downloads/${filename}`; // Local file path for download

        exec(
          `yt-dlp -o "${localFilePath}" ${videoUrl}`,
          async (err, stdout, stderr) => {
            if (err) {
              console.error("Error in downloading video:", err);
              reject(err);
            } else {
              // Upload to Google Cloud Storage
              const gcsPath = await uploadToGoogleCloud(
                localFilePath,
                filename
              );

              // Update the database with the Google Cloud Storage URL/path
              await updateVideoPathInDatabase(video.id, gcsPath);

              setTimeout(async () => {
                try {
                  // Transcribe the video if needed, using the local file
                  const transcriptionResult = await transcribeVideo(
                    localFilePath
                  );
                  console.log(
                    `Transcription completed for video ID: ${video.id}`
                  );

                  // Store transcription results
                  await storeTranscriptionResults(
                    video.id,
                    transcriptionResult
                  );

                  resolve();
                } catch (error) {
                  console.error(
                    `Error processing transcription for video ID: ${video.id}`,
                    error
                  );
                  reject(error);
                }
              }, 5000); // Delay to ensure file write completion
            }
          }
        );
      });
    } catch (error) {
      console.error("Error processing video:", videoUrl, error);
    }
  }
};

module.exports = {
  fetchVideosForConversion,
  downloadAndConvertVideos,
};
