import streamlit as st
import matplotlib.pyplot as plt
from datetime import datetime
import os, json, sys
from glob import glob

# 📦 LangChain / Ollama Modules
from langchain_community.vectorstores import Chroma
from langchain_ollama import OllamaEmbeddings

# 👇 Fix path to import ai_modules and src
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# 👇 Import Project Modules
from ai_modules.empathetic_chat import create_chat_agent, get_response
from src.mood_tracker import log_mood, show_mood_graph

# ----------------- 🚀 APP CONFIG -----------------
st.set_page_config(page_title="MindMate AI", layout="wide")
st.title("🧠 MindMate AI – Emotional Wellness Companion")

# ----------------- 🤖 LLM INIT -----------------
if "agent" not in st.session_state:
    st.session_state.agent = create_chat_agent()

# ----------------- 🧠 VECTOR DB SETUP -----------------
embedding = OllamaEmbeddings(model="phi")
vector_db = Chroma(persist_directory="vectorstore", embedding_function=embedding)

# ----------------- 📜 SIDEBAR – CHAT HISTORY -----------------
with st.sidebar:
    st.subheader("📜 Past Conversations")
    os.makedirs("chat_logs", exist_ok=True)
    log_files = sorted(glob("chat_logs/chat_*.json"))[-5:]
    combined_logs = []

    for file in log_files:
        try:
            with open(file, "r", encoding="utf-8") as f:
                daily_logs = json.load(f)
                combined_logs.extend(daily_logs[-5:])
        except Exception as e:
            st.warning(f"⚠️ Error reading {file}: {e}")

    if combined_logs:
        for data in combined_logs[-5:]:
            st.markdown(f"🧑‍💻 **You**: {data['user']}")
            st.markdown(f"🧠 **MindMate**: {data['bot']}")
    else:
        st.info("No past chats found.")

# ----------------- 💬 CHAT SECTION -----------------
st.subheader("🗣️ Chat with MindMate AI")
user_input = st.text_input("Type your message here...", key="chat_input")

if st.button("Send") or user_input:
    if user_input.strip():
        current_mood = st.session_state.get("current_mood", "Neutral")
        previous_mood = st.session_state.get("previous_mood", "Neutral")

        # 🎯 Dynamic tone adjustment
        tone = "Be balanced and helpful."
        if current_mood in ["Very Sad", "Sad"]:
            tone = "Be gentle, compassionate, and supportive. Offer emotional encouragement."
        elif current_mood in ["Happy", "Very Happy"]:
            tone = "Be positive, enthusiastic, and reinforcing. Keep the good mood going!"

        # 🤖 Get response from AI
        reply = get_response(
            agent=st.session_state.agent,
            vector_db=vector_db,
            user_input=user_input,
            previous_mood=previous_mood,
            current_mood=current_mood,
            tone=tone
        )

        # 💬 Display both user and AI
        st.markdown(f"🧑‍💻 **You:** {user_input}")
        st.markdown(f"🧠 **MindMate:** {reply}")

        # 🧠 Smart Emotional Memory Capture
        emotional_keywords = [
            "exam", "stress", "goal", "panic", "afraid", "failure", "depression", "nervous",
            "rejected", "alone", "tired", "lost", "overwhelmed", "burnout", "hopeless", "worthless"
        ]
        if any(word in user_input.lower() for word in emotional_keywords):
            memory_data = {"context": []}
            if os.path.exists("memory.json"):
                with open("memory.json", "r", encoding="utf-8") as mem:
                    try:
                        memory_data = json.load(mem)
                    except:
                        memory_data = {"context": []}
            memory_data["context"].append(user_input)
            memory_data["context"] = memory_data["context"][-5:]
            with open("memory.json", "w", encoding="utf-8") as mem:
                json.dump(memory_data, mem, indent=2)

        # ✅ Clear memory if issue resolved
        if any(x in user_input.lower() for x in ["solved", "no longer", "resolved", "done", "handled"]):
            if os.path.exists("memory.json"):
                os.remove("memory.json")
                st.success("🧠 Old memory cleared — Great to see your progress!")

# ----------------- 📊 MOOD TRACKER -----------------
st.divider()
st.subheader("💖 Mood Tracker")
mood = st.slider("How do you feel today? (1 – Very Sad → 5 – Very Happy)", 1, 5, 3)

if st.button("Submit Mood"):
    log_mood(mood)
    st.session_state.previous_mood = st.session_state.get("current_mood", "Neutral")
    st.session_state.current_mood = {
        1: "Very Sad", 2: "Sad", 3: "Neutral", 4: "Happy", 5: "Very Happy"
    }.get(mood, "Neutral")
    st.success("Mood saved!")

# 📈 Show mood chart
show_mood_graph()

# ----------------- 🌱 SELF-CARE REMINDER -----------------
st.divider()
st.subheader("🌱 Self-Care Reminder")

if st.button("Set Random Self-Care Reminder"):
    reminders = [
        "💧 Drink a glass of water.",
        "🧘‍♀️ Take 3 deep breaths.",
        "🚶‍♂️ Go for a short walk.",
        "🎷 Listen to your favorite music.",
        "📖 Read a page of a book.",
        "🌸 Look at nature for 2 minutes.",
        "😌 Relax your shoulders and breathe."
    ]
    selected = reminders[datetime.now().second % len(reminders)]
    with open("reminders.txt", "a", encoding="utf-8") as f:
        f.write(f"{datetime.now().isoformat()} - {selected}\n")
    st.success(f"Reminder set: **{selected}**")
