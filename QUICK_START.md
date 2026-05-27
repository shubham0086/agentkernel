# ⚡ Quick Start Guide

This guide will get you up and running with **Equilibrium** in under 5 minutes.

---

## 🐍 Running the Python Suite

### 1. Set Up Virtual Environment
Navigate to the `python` directory and install the requirements:

```bash
cd python
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment Variables (Optional)
Create a `.env` file in the `python/` directory or export variables:

```env
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
GEMINI_API_KEY=your_key
FIRECRAWL_API_KEY=your_key
REDIS_URL=redis://localhost:6379/0
```
> [!NOTE]
> If keys are omitted, the Search aggregate falls back to a **keyless DuckDuckGo scraper**, the LLM Router falls back to a local **Ollama** server, and the Task Queue falls back to an **in-memory async queue**.

### 3. Run the Example Application
Execute the *Research Video Assistant* example:

```bash
python examples/research-video-assistant/run_assistant.py
```

---

## 📦 Running the ESModules JavaScript Suite

The JS implementation is written in modern ESModules.

### 1. Install Node Dependencies
Navigate to the `esm/` directory and install dependencies:

```bash
cd esm
npm install
```

### 2. Run the Example Assistant
Execute the workflow pipeline using Node.js:

```bash
node examples/research-video-assistant/run_assistant.js
```

### 3. Render the Video Report (Remotion)
If you have React and Remotion packages configured, you can build the vertical slideshow video manifest automatically:

```bash
npx remotion render StoryTemplate out/ayurvedic-wellness-leads.mp4 --props='{"folder": "ayurvedic-wellness-jaipur-leads"}'
```

---

## 🐳 Running with Docker

To boot the complete distributed stack (API, Redis queue database, and environment routing) in one line:

```bash
docker-compose up --build
```
