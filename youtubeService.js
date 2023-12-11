const axios = require("axios");

const YOUTUBE_API_KEY = "AIzaSyCHtmnGOBG01snGZUvhnwBnBewllCDRmzM"; // Store your API key in an environment variable

const fetchChannelData = async (channelId) => {
  try {
    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/search`,
      {
        params: {
          order: "date",
          part: "snippet",
          channelId: channelId,
          maxResults: 25,
          key: YOUTUBE_API_KEY,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching from YouTube API:", error);
    throw error; // Or handle it as you see fit
  }
};

module.exports = { fetchChannelData };
