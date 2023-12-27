const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
const { createClient: createDeepgramClient } = require("@deepgram/sdk");
const fs = require("fs");
const path = require("path");

const supabaseUrl = "https://huzelhrvjaqhqldtnavm.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1emVsaHJ2amFxaHFsZHRuYXZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDE4MDg3MjgsImV4cCI6MjAxNzM4NDcyOH0.ANdjKRfw-KUssIgCkq234WmeRpfns6cO0C2ZvQUQV_w";
const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);
const deepgramApiKey = "c159d27be69405b1c2f5dc630e5e3fcc034cfdda";

const deepgram = createDeepgramClient(deepgramApiKey);

const fetchUnprocessedPodcastEpisodes = async () => {
  console.log("Fetching unprocessed podcast episodes...");

  let { data: episodes, error } = await supabase
    .from("podcast_episodes")
    .select("*")
    .eq("Processed", false);

  if (error) {
    console.error("Error fetching unprocessed podcast episodes:", error);
    return [];
  }

  console.log(`Fetched ${episodes.length} unprocessed podcast episodes.`);
  return episodes;
};

const transcribePodcastEpisode = async (audioUrl) => {
  console.log(`Transcribing podcast episode from URL: ${audioUrl}`);
  try {
    const { result } = await deepgram.listen.prerecorded.transcribeUrl(
      { url: audioUrl },
      { punctuate: true, model: "enhanced", language: "sv" } // Adjust as needed
    );

    console.log("Deepgram Transcription Result:", result);
    return result;
  } catch (error) {
    console.error(`Error during transcription of ${audioUrl}:`, error);
    throw error;
  }
};

const updatePodcastEpisodeAsProcessed = async (episodeId) => {
  try {
    const { data, error } = await supabase
      .from("podcast_episodes")
      .update({ Processed: true })
      .match({ id: episodeId });

    if (error) {
      console.error("Error updating podcast episode as processed:", error);
      throw error;
    }

    console.log("Podcast episode marked as processed for ID:", episodeId);
  } catch (error) {
    console.error("Error in updatePodcastEpisodeAsProcessed function:", error);
    throw error;
  }
};

const storePodcastTranscriptionResults = async (
  episodeId,
  deepgramResponse
) => {
  try {
    if (
      !deepgramResponse ||
      !deepgramResponse.results ||
      !deepgramResponse.results.channels
    ) {
      throw new Error("Invalid transcription response structure.");
    }

    // Check if there's at least one channel and alternative in the response
    const channelData = deepgramResponse.results.channels[0];
    if (
      !channelData ||
      !channelData.alternatives ||
      channelData.alternatives.length === 0
    ) {
      throw new Error("No transcription alternatives found.");
    }

    const transcription = channelData.alternatives[0];
    const transcript = transcription.transcript || "";
    const confidence = transcription.confidence || 0;
    const duration = deepgramResponse.metadata.duration || 0;

    // Check and format words only if they are present
    const reformattedWords = transcription.words
      ? transcription.words.map((word) => ({
          end: word.end,
          word: word.word,
          start: word.start,
          confidence: word.confidence,
          punctuated_word: word.punctuated_word,
        }))
      : [];

    console.log(
      "Storing transcription results for podcast episode ID:",
      episodeId
    );
    const { data, error } = await supabase
      .from("podcast_transcriptions")
      .insert([
        {
          PodcastEpisodeId: episodeId,
          Transcript: transcript,
          Confidence: confidence,
          Duration: duration,
          Words: reformattedWords,
        },
      ]);

    if (error) {
      console.error("Error storing transcription results:", error);
      throw error;
    } else {
      console.log("Successfully stored transcription results:", data);
    }
  } catch (error) {
    console.error("Error in storePodcastTranscriptionResults function:", error);
    throw error;
  }
};

const processPodcastEpisodes = async () => {
  const episodes = await fetchUnprocessedPodcastEpisodes();
  for (const episode of episodes) {
    try {
      const transcriptionResult = await transcribePodcastEpisode(
        episode.audiolink
      );
      await storePodcastTranscriptionResults(episode.id, transcriptionResult);
      await updatePodcastEpisodeAsProcessed(episode.id);
    } catch (error) {
      console.error(`Error processing episode ID: ${episode.id}`, error);
    }
  }
};

module.exports = {
  processPodcastEpisodes,
};
