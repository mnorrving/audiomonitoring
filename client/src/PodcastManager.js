import React, { useState } from "react";
import { supabase } from "./supabaseClient";

function PodcastManager() {
  const [rssFeedUrl, setRssFeedUrl] = useState("");
  // State for storing fetched podcasts and episodes can be added as needed

  const handleInputChange = (event) => {
    setRssFeedUrl(event.target.value);
  };

  const handleProcessPodcasts = async () => {
    try {
      const response = await fetch("/api/processPodcasts", { method: "POST" });
      if (response.ok) {
        console.log("Podcast processing started");
      } else {
        console.error("Failed to start podcast processing");
      }
    } catch (error) {
      console.error("Error processing podcasts:", error);
    }
  };

  const handleAddPodcast = async () => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_BASE_URL}/api/addPodcast`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ rssFeedUrl }),
        }
      );

      if (response.ok) {
        console.log("Podcast added successfully");
      } else {
        console.error("Failed to add podcast");
      }
    } catch (error) {
      console.error("Error adding podcast:", error);
    }
  };
  return (
    <div>
      <input
        type="text"
        value={rssFeedUrl}
        onChange={handleInputChange}
        placeholder="Enter Podcast RSS Feed URL"
      />
      <button onClick={handleAddPodcast}>Add Podcast</button>
      <button onClick={handleProcessPodcasts}>Process Podcast Episodes</button>
    </div>
  );
}

export default PodcastManager;
