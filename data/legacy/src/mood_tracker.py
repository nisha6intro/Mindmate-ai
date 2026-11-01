import os
import csv
from datetime import datetime
import streamlit as st
import matplotlib.pyplot as plt

# ✅ File path
MOOD_LOG_PATH = os.path.join("data", "mood_logs.csv")

# ✅ Ensure the file and folder exist
def ensure_file_exists():
    os.makedirs("data", exist_ok=True)
    if not os.path.exists(MOOD_LOG_PATH):
        with open(MOOD_LOG_PATH, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["timestamp", "mood"])

# ✅ Log mood with timestamp
def log_mood(mood_level):
    ensure_file_exists()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(MOOD_LOG_PATH, "a", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([timestamp, mood_level])

# ✅ Read data from mood log file
def read_mood_data():
    ensure_file_exists()
    mood_data = []
    with open(MOOD_LOG_PATH, "r") as f:
        reader = csv.reader(f)
        next(reader, None)  # skip header
        for row in reader:
            if len(row) == 2:
                mood_data.append(row)
    return mood_data

# ✅ Show mood graph with last 7 logs
def show_mood_graph():
    mood_data = read_mood_data()
    if mood_data:
        last_7 = mood_data[-7:]
        timestamps = [d[0][11:16] for d in last_7]  # extract HH:MM
        mood_levels = [int(d[1]) for d in last_7]

        fig, ax = plt.subplots()
        ax.plot(timestamps, mood_levels, marker='o', linestyle='-', color='purple')
        ax.set_ylim(0.5, 5.5)
        ax.set_yticks([1, 2, 3, 4, 5])
        ax.set_yticklabels(["😢", "☹️", "😐", "😊", "😄"])
        ax.set_title("📈 Your Mood Changes Today")
        ax.set_xlabel("🕒 Time")
        ax.set_ylabel("Mood Level")
        st.pyplot(fig)
    else:
        st.info("No mood data found yet. Please submit your mood.")
