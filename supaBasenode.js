// supabaseClient.js
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://huzelhrvjaqhqldtnavm.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1emVsaHJ2amFxaHFsZHRuYXZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDE4MDg3MjgsImV4cCI6MjAxNzM4NDcyOH0.ANdjKRfw-KUssIgCkq234WmeRpfns6cO0C2ZvQUQV_w";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

module.exports = supabase;
