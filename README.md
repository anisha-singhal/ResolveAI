# ResolveAI - Autonomous AI Support Triage System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[Live Demo Link - Frontend (Vercel)](https://resolve-ai-zs2q.vercel.app/)** | **[Backend API (Render)](https://resolveai-backend.onrender.com)** | **[Video Demo Link](YOUR_VIDEO_DEMO_URL_HERE)**

ResolveAI is an end-to-end autonomous system designed to ingest, analyze, and respond to customer support emails, eliminating the need for manual intervention in the initial triage process. It leverages Retrieval-Augmented Generation (RAG) and advanced prompt engineering to provide context-aware solutions and categorizes incoming requests.

![Dashboard Screenshot](PATH_TO_YOUR_DASHBOARD_SCREENSHOT.png) 

## Overview

In today's fast-paced customer service environment, quickly addressing support requests is crucial. ResolveAI acts as a 24/7 digital team member, performing the initial triage automatically:
1.  **Ingestion:** Monitors a dedicated support inbox via IMAP for new emails.
2.  **Analysis (RAG):** Extracts email content, queries a Pinecone vector database (populated with a custom knowledge base) for relevant context, and uses Google's Gemini API with a Chain of Thought prompt to classify the issue, determine priority, assess confidence, and generate a solution.
3.  **Response:** Automatically sends a threaded reply back to the user via Nodemailer.
4.  **Logging & Feedback:** Saves the triaged ticket (including AI analysis) to an SQLite database and presents it on a React dashboard. Includes a human-in-the-loop interface for verifying or correcting the AI's triage.

## Architecture

[Customer Email] -> [Support Inbox (IMAP)] -> [Node.js Backend (Render)] | V [AI Agent (Gemini API)] <-> [Pinecone DB (Knowledge Base)] | V [SQLite DB (Ticket Log)] | V [Nodemailer (Send Reply)] -> [Customer] | V [API Endpoint (/api/tickets)] -> [React Frontend (Vercel)] -> [Support Agent (Human Review)]


## Features

* **Autonomous Email Monitoring:** Continuously checks a specified IMAP inbox for new emails using `node-cron`.
* **RAG Pipeline:** Leverages Pinecone and Google's embedding model for accurate, context-aware information retrieval from a custom knowledge base.
* **Advanced AI Triage:** Utilizes Google's Gemini API with Chain of Thought prompting to perform:
    * Issue Classification (Configurable categories)
    * Priority Scoring (Low, Medium, High)
    * Confidence Assessment (0.0 to 1.0)
    * Context-Grounded Solution Generation
* **Automated Threaded Replies:** Sends AI-generated solutions back to the user as correctly threaded replies using Nodemailer.
* **Real-time Dashboard:** A React frontend displays processed tickets, AI analysis, and allows for interaction.
* **Human-in-the-Loop:** Dashboard interface allows human agents to review, verify, or correct the AI's classification and priority, improving the system over time.
* **Persistent Logging:** Uses SQLite to store a record of all processed tickets.

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

## Future Enhancements

* Move `SUPPORT_CATEGORIES` to a configuration file or database table.
* Implement more sophisticated error handling and retry logic.
* Add user authentication for the dashboard.
* Allow manual triggering of replies for low-confidence tickets.
* Use feedback data (`is_verified`) to potentially fine-tune models or improve prompts.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
