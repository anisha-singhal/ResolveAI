# 🤖 ResolveAI - Autonomous AI Support Triage System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![AI Powered](https://img.shields.io/badge/AI-Google%20Gemini-orange.svg)](https://ai.google.dev/)

> **Intelligent email support automation powered by AI** - Automatically categorize, prioritize, and respond to customer support emails with confidence-based human oversight.

## 🚀 Live Demo

**[🌐 Frontend Dashboard](https://resolve-ai-zs2q.vercel.app/)** | **[⚡ Backend API](https://resolveai-backend.onrender.com)** | **[🎥 Video Demo](YOUR_VIDEO_DEMO_URL_HERE)**
</div>

ResolveAI is an end-to-end autonomous system designed to ingest, analyze, and respond to customer support emails, eliminating the need for manual intervention in the initial triage process. It leverages Retrieval-Augmented Generation (RAG) and advanced prompt engineering to provide context-aware solutions and categorizes incoming requests.

## 🎥 Live Demo

![ResolveAI Demo](./assets/clideo_editor_e5eba2dd1d4941dab544e2e07345b063.gif)

*Complete ResolveAI workflow: Email processing → AI analysis → Automatic replies → Human oversight*

In today's fast-paced customer service environment, quickly addressing support requests is crucial. ResolveAI acts as a 24/7 digital team member, performing the initial triage automatically:
1.  **Ingestion:** Monitors a dedicated support inbox via IMAP for new emails.
2.  **Analysis (RAG):** Extracts email content, queries a Pinecone vector database (populated with a custom knowledge base) for relevant context, and uses Google's Gemini API with a Chain of Thought prompt to classify the issue, determine priority, assess confidence, and generate a solution.
3.  **Response:** Automatically sends a threaded reply back to the user via Nodemailer.
4.  **Logging & Feedback:** Saves the triaged ticket (including AI analysis) to an SQLite database and presents it on a React dashboard. Includes a human-in-the-loop interface for verifying or correcting the AI's triage.

## Architecture

[Customer Email] -> [Support Inbox (IMAP)] -> [Node.js Backend (Render)] | V [AI Agent (Gemini API)] <-> [Pinecone DB (Knowledge Base)] | V [SQLite DB (Ticket Log)] | V [Nodemailer (Send Reply)] -> [Customer] | V [API Endpoint (/api/tickets)] -> [React Frontend (Vercel)] -> [Support Agent (Human Review)]


## ✨ Key Features

### 🎯 Core AI Capabilities
- **🤖 Autonomous Email Processing**: Continuously monitors Gmail inbox with IMAP integration
- **🧠 RAG Pipeline**: Context-aware responses using Pinecone vector database + Google Gemini
- **📊 Confidence Scoring**: Only auto-responds to high-confidence classifications (>80%)
- **🎯 Smart Categorization**: 
  - Shipping Inquiry
  - Return Request  
  - Billing Question
  - General Inquiry
  - Uncategorized
- **⚡ Priority Assessment**: Automatic Low/Medium/High priority scoring

### 🎨 Professional Interface
- **🌙 Dark Purple Sidebar**: Clean, modern design with professional aesthetics
- **📱 Responsive Layout**: Works seamlessly across desktop and mobile
- **📊 Real-time Stats**: Live ticket counts and verification metrics
- **🔄 Auto-refresh**: 15-second polling for live updates
- **✅ Verification System**: Human oversight for AI decisions

### 🚀 Advanced Features
- **📧 Threaded Replies**: Maintains proper email conversation threading
- **🎨 React Icons**: Professional UI with Remix Icon library
- **💾 SQLite Database**: Persistent ticket storage and history
- **🔧 Environment Config**: Easy deployment configuration
- **📈 Analytics Ready**: Built-in metrics and confidence tracking

## Tech Stack

* **Backend:** Node.js, Express.js
* **Frontend:** React.js, Vite, Tailwind CSS
* **AI:** Google Gemini API, Google Embeddings
* **Vector Database:** Pinecone
* **Database:** SQLite
* **Email:** `imap-simple` (Reading), Nodemailer (Sending)
* **Scheduling:** `node-cron`
* **Deployment:** Render (Backend), Vercel (Frontend)

## Setup and Installation (Local Development)

**Prerequisites:**
* Node.js (v18 or later recommended)
* npm or yarn
* Git
* API Keys for:
    * Google AI (Gemini API)
    * Pinecone
* A Gmail account with an App Password enabled (for IMAP/SMTP)

**Steps:**

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/your-username/ResolveAI.git](https://github.com/your-username/ResolveAI.git)
    cd ResolveAI
    ```

2.  **Backend Setup:**
    * Navigate to the backend directory: `cd backend`
    * Create a `.env` file and add your credentials:
        ```dotenv
        GOOGLE_API_KEY=your_google_api_key
        PINECONE_API_KEY=your_pinecone_api_key
        IMAP_USER=your_support_email@gmail.com
        IMAP_PASSWORD=your_gmail_app_password
        ```
    * Install dependencies: `npm install`
    * *(Optional)* Add `.txt` files containing your specific knowledge base articles to the `backend/knowledge_base` directory.
    * Run the Pinecone ingestion script to load your knowledge base: `node ingest.js`
    * *(First time only or after schema changes)* Delete `triage.db` if it exists.
    * Start the backend server: `node server.js`

3.  **Frontend Setup:**
    * Open a **new terminal** and navigate to the frontend directory: `cd ../frontend`
    * Install dependencies: `npm install`
    * *(Optional: If using environment variables for backend URL)* Create a `.env` file:
        ```dotenv
        VITE_API_BASE_URL=http://localhost:3001
        ```
    * Start the frontend development server: `npm run dev`
    * Open your browser to the URL provided (usually `http://localhost:5173`).

## Deployment

* **Backend:** Deployed on [Render](https://resolveai-backend.onrender.com). Remember to set environment variables in the Render service settings.
* **Frontend:** Deployed on [Vercel](https://resolve-ai-zs2q.vercel.app/). Set the `VITE_API_BASE_URL` environment variable in Vercel project settings to your live Render backend URL.

## 🚀 Future Enhancements

- 📋 Move `SUPPORT_CATEGORIES` to configuration management
- 🔄 Implement retry logic and advanced error handling  
- 🔐 Add user authentication and role-based access
- ⚡ Manual reply triggering for low-confidence tickets
- 📊 Use verification feedback to improve AI accuracy
- 📱 Mobile app for on-the-go ticket management
- 🔍 Advanced search and filtering capabilities
- 📊 Comprehensive analytics and reporting dashboard

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**⭐ Star this repo if ResolveAI helped you automate customer support!**

Made with ❤️ by [Your Name](https://github.com/your-username)
