# AI Tutor Assistant

An AI-powered Tutor Assistant that allows users to upload documents (PDF/DOCX), generate embeddings, store them in a vector database, and ask context-aware questions using Retrieval-Augmented Generation (RAG).

---

#  Features

*  Upload PDF and DOCX documents
*  Extract and process document text
*  Smart chunking for large documents
*  Semantic search using vector embeddings
*  Store embeddings using PostgreSQL + pgvector
*  AI-powered question answering using Llama 3
*  Retrieval-Augmented Generation (RAG)
*  Context-aware responses from uploaded documents
*  Docker support for pgvector database
*  Scalable architecture for large documents (200+ pages)

---

#  Tech Stack

## Backend

* NestJS
* TypeScript
* Prisma ORM

## AI / ML

* Ollama
* nomic-embed-text
* Llama 3 8B
* OpenRouter API

## Database

* PostgreSQL
* pgvector

## File Processing

* pdf-parse
* mammoth

---

#  System Architecture

```text
Upload Document
       ↓
Text Extraction
       ↓
Chunking
       ↓
Embedding Generation
       ↓
Store in pgvector
       ↓
Semantic Retrieval
       ↓
LLM Context Generation
       ↓
AI Response
```

---

#  Project Structure

```text
src/
│
├── document/
│   ├── document.controller.ts
│   ├── document.service.ts
│   └── document.module.ts
│
├── rag/
│   ├── rag.controller.ts
│   ├── rag.service.ts
│   └── rag.module.ts
│
├── prisma/
│   ├── prisma.service.ts
│   └── prisma.module.ts
│
├── app.module.ts
└── main.ts
```

---

# ⚙️ Setup Instructions

## 1️⃣ Clone Repository

```bash
git clone <your-repo-url>
cd ai-tutor/backend
```

---

# 2️⃣ Install Dependencies

```bash
npm install
```

---

# 3️⃣ Start pgvector Database using Docker

```bash
docker run -d \
--name db-pgvector \
-e POSTGRES_PASSWORD=1916 \
-e POSTGRES_DB=ai_tutor \
-p 5432:5432 \
ankane/pgvector
```

---

# 4️⃣ Enable pgvector Extension

```bash
docker exec -it db-pgvector psql -U postgres -d ai_tutor
```

Inside PostgreSQL:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

# 5️⃣ Configure Environment Variables

Create `.env`

```env
DATABASE_URL=postgresql://postgres:1916@localhost:5432/ai_tutor
OPENROUTER_API_KEY=your_openrouter_api_key
```

---

# 6️⃣ Run Prisma

```bash
npx prisma generate
npx prisma migrate dev
```

---

# 7️⃣ Start Ollama

Install Ollama and run:

```bash
ollama run nomic-embed-text
```

---

# 8️⃣ Start Backend Server

```bash
npm run start:dev
```

---

# 📡 API Endpoints

## Upload Document

### POST

```text
/document/upload
```

### Form Data

```text
file : PDF/DOCX
```

---

## Ask Questions

### POST

```text
/rag/ask
```

### JSON Body

```json
{
  "question": "What is organizational culture?"
}
```

---

# How RAG Works

1. User uploads document
2. Text extracted from document
3. Text split into chunks
4. Embeddings generated using Ollama
5. Embeddings stored in pgvector
6. User asks question
7. Relevant chunks retrieved using vector similarity
8. Context sent to Llama 3
9. AI generates answer based on uploaded document

---

# Future Enhancements

*  PPT generation from notes
* Automatic notes generation
*  Course planning assistant
*  Voice interaction
*  Frontend integration
*  Streaming AI responses
*  Hybrid search (keyword + semantic)
*  Personalized tutor recommendations

---

# Author

Yojashri

---

# 📄 License

MIT License
