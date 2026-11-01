from langchain.chains import ConversationChain
from langchain.memory import ConversationBufferMemory
from langchain_community.chat_models import ChatOllama
from datetime import datetime
import os
import json

# ✅ Create chat agent using fine-tuned Ollama model
def create_chat_agent():
    llm = ChatOllama(model="phi-mindmate", streaming=True)
    memory = ConversationBufferMemory(return_messages=True)
    return ConversationChain(llm=llm, memory=memory)

# ✅ Save chat into daily log
def save_chat_log(user_input, bot_reply):
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        log_file = f"chat_logs/chat_{today}.json"
        os.makedirs("chat_logs", exist_ok=True)

        if os.path.exists(log_file):
            with open(log_file, "r", encoding="utf-8") as f:
                try:
                    logs = json.load(f)
                    if not isinstance(logs, list):
                        logs = []
                except:
                    logs = []
        else:
            logs = []

        logs.append({
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "user": user_input,
            "bot": bot_reply
        })

        with open(log_file, "w", encoding="utf-8") as f:
            json.dump(logs, f, indent=2)

    except Exception as e:
        print(f"❌ Failed to save chat log: {e}")

# 🧠 Load memory context (retrieve the last relevant non-repeating user input)
def load_memory_context(user_input):
    logs_dir = "chat_logs"
    if not os.path.exists(logs_dir):
        return None

    all_files = sorted([f for f in os.listdir(logs_dir) if f.endswith(".json")])
    all_files.reverse()

    for file in all_files:
        with open(os.path.join(logs_dir, file), "r", encoding="utf-8") as f:
            try:
                logs = json.load(f)
                for i in range(len(logs)-1, -1, -1):
                    if len(logs[i]["user"]) > 10 and logs[i]["user"].lower() not in user_input.lower():
                        return logs[i]["user"]
            except:
                continue
    return None

# 🔁 New proactive memory recall from memory.json
def recall_memory_if_relevant(user_input):
    memory_path = "memory.json"
    if not os.path.exists(memory_path):
        return ""

    try:
        with open(memory_path, "r", encoding="utf-8") as mem_file:
            memory_data = json.load(mem_file).get("context", [])
    except:
        return ""

    for past_input in memory_data[-5:]:
        if any(word in user_input.lower() for word in past_input.lower().split()):
            return f"(Recalling from memory: '{past_input}')\n"
    
    return ""

# 🧠 Update memory.json
def update_memory_file(user_input):
    try:
        memory_data = {"context": []}
        if os.path.exists("memory.json"):
            with open("memory.json", "r", encoding="utf-8") as f:
                memory_data = json.load(f)
        if "context" not in memory_data:
            memory_data["context"] = []

        memory_data["context"].append(user_input)

        with open("memory.json", "w", encoding="utf-8") as f:
            json.dump(memory_data, f, indent=2)

    except Exception as e:
        print(f"❌ Failed to update memory.json: {e}")

# 💬 Generate a check-in line if relevant context is found
def generate_checkin_line(previous_message):
    if not previous_message:
        return ""
    return f"Earlier, you mentioned: \"{previous_message}\". Just checking in — how are you feeling now?\n\n"

# ✅ Generate final AI response (improved empathetic version)
def get_response(agent, vector_db, user_input, previous_mood="Neutral", current_mood="Neutral", tone="Be empathetic."):
    try:
        # 🔍 Search relevant context from vector DB
        docs = vector_db.similarity_search(user_input, k=1)
        context = "\n".join([doc.page_content for doc in docs])[:500] if docs else ""

        # 🧠 Load context from previous logs
        prev_context = load_memory_context(user_input)

        # 📂 Fallback to memory.json if no previous context
        if not prev_context and os.path.exists("memory.json"):
            try:
                with open("memory.json", "r", encoding="utf-8") as mem:
                    memory_data = json.load(mem)
                    if memory_data.get("context"):
                        prev_context = memory_data["context"][-1]
            except:
                pass

        # 🔁 Proactive memory recall
        proactive_memory = recall_memory_if_relevant(user_input)

        # 💬 Generate check-in line if needed
        checkin_line = generate_checkin_line(prev_context)

        # 🧾 Final prompt construction
        full_prompt = (
            f"{tone.strip()}\n\n"
            f"User previously felt: {previous_mood}\n"
            f"Current mood: {current_mood}\n\n"
            f"{checkin_line.strip()}\n"
            f"{proactive_memory.strip()}\n"
            f"{'Here is some helpful context:\n' + context.strip() if context else ''}\n\n"
            f"User said: \"{user_input.strip()}\"\n"
            f"Respond in a caring and supportive way:"
        )

        # 💬 Stream AI response
        final_reply = ""
        for chunk in agent.llm.stream(full_prompt):
            final_reply += chunk.content if hasattr(chunk, "content") else chunk.get("response", "")

        # 💾 Log chat and update memory
        save_chat_log(user_input, final_reply.strip())
        update_memory_file(user_input)

        return final_reply.strip()

    except Exception as e:
        return f"⚠️ Error generating response: {e}"
