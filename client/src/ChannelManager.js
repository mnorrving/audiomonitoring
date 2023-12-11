import React, { useState } from "react";
import { supabase } from "./supabaseClient";

function ChannelManager() {
  const [channelId, setChannelId] = useState("");
  const [channels, setChannels] = useState([]);

  const handleInputChange = (event) => {
    setChannelId(event.target.value);
  };

  const handleAddChannel = async () => {
    await addChannel(channelId);
  };

  const handleDownloadVideos = async () => {
    const response = await fetch(
      `${process.env.REACT_APP_API_BASE_URL}/downloadVideos`,
      {
        method: "POST",
        // Any additional options like headers, body, etc.
      }
    );

    // Handle the response
  };

  const transformVideoData = (items) => {
    return items.map((item) => {
      return {
        VideoId: item.id.videoId,
        PublishedAt: item.snippet.publishedAt,
        ChannelId: item.snippet.channelId,
        Title: item.snippet.title,
        Description: item.snippet.description,
        ThumbnailUrl: item.snippet.thumbnails.high.url,
      };
    });
  };

  const transformApiResponseToDbFormat = (apiResponse) => {
    const firstItem = apiResponse.items[0];

    const channelData = {
      ChannelId: firstItem.snippet.channelId,
      ChannelTitle: firstItem.snippet.channelTitle,
      TotalResults: apiResponse.pageInfo.totalResults,
      RegionCode: apiResponse.regionCode,
      AddedDate: new Date().toISOString(),
    };

    return channelData;
  };

  const addChannel = async (channelId) => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_BASE_URL}/api/fetchChannel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ channelId }),
        }
      );

      if (!response.ok) {
        throw new Error(
          "Network response was not ok when fetching channel data"
        );
      }

      const apiResponse = await response.json();
      const channelData = transformApiResponseToDbFormat(apiResponse);
      const videoData = transformVideoData(apiResponse.items);

      const { data: channelDataResult, error: channelError } = await supabase
        .from("yt-channels")
        .insert([channelData]);

      if (channelError) {
        console.error("Error adding channel to Supabase:", channelError);
        return;
      }

      const { data: videoDataResult, error: videoError } = await supabase
        .from("yt-videos")
        .insert(videoData);

      if (videoError) {
        console.error("Error adding videos to Supabase:", videoError);
        return;
      }

      // Optionally, refresh the list of channels
      // fetchChannels();
    } catch (error) {
      console.error("Error in addChannel function:", error);
    }
  };

  return (
    <div>
      <input
        type="text"
        value={channelId}
        onChange={handleInputChange}
        placeholder="Enter YouTube Channel ID"
      />
      <button onClick={handleAddChannel}>Add</button>
      <button onClick={handleDownloadVideos}>Download Videos</button>
      {/* Rest of your component */}
    </div>
  );
}

export default ChannelManager;
