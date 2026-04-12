"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
  uploadDocument,
  askQuestion,
  getUserChats,
  getChatMessages,
  deleteChat,
} from "@/services/tutor.service";
import axios from "axios";
import toast from "react-hot-toast";
import Header  from "@/components/Header";
import { Trash2 } from "lucide-react";
export default function NotesPage() {
  const [question, setQuestion] = useState("");
  const [course, setCourse] = useState("");
  const [customCourse, setCustomCourse] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [chatFiles, setChatFiles] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [chats, setChats] = useState<any[]>([]);
  const [activeChat, setActiveChat] = useState<number | null>(null);

  const [versionId, setVersionId] = useState<number | null>(null);

  const bottomRef = useRef<any>(null);

  //////////////////////////////////////////////////////
  // AUTH
  //////////////////////////////////////////////////////
  useEffect(() => {
    axios.defaults.withCredentials = true;

    axios.get("http://localhost:5000/auth/me").catch(() => {
      toast.error("Login required");
      window.location.href = "/login";
    });
  }, []);

  //////////////////////////////////////////////////////
  // LOAD CHATS
  //////////////////////////////////////////////////////
  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    try {
      const res = await getUserChats();
      setChats(res.data || []);
    } catch {
      toast.error("Failed to load chats");
    }
  };

  //////////////////////////////////////////////////////
  // LOGOUT 🔥
  //////////////////////////////////////////////////////
  const logout = async () => {
    try {
      await axios.post("http://localhost:5000/auth/logout");
      toast.success("Logged out 👋");
      window.location.href = "/login";
    } catch {
      toast.error("Logout failed");
    }
  };

  //////////////////////////////////////////////////////
  // OPEN CHAT
  //////////////////////////////////////////////////////
  const openChat = async (chatId: number) => {
    if (!chatId || isNaN(chatId)) return;

    try {
      setActiveChat(chatId);

      const res = await getChatMessages(chatId);

      setMessages(res.messages || []);
      setVersionId(res.versionId || null);

      const selected = chats.find((c) => c.id === chatId);

      if (selected?.document?.name) {
        setChatFiles((prev) =>
          prev.includes(selected.document.name)
            ? prev
            : [...prev, selected.document.name]
        );
      } else {
        setChatFiles([]);
      }

      const qRes = await axios.get(
        `http://localhost:5000/chat/questions/${chatId}`
      );

      setQuestions(qRes.data.questions || []);
    } catch {
      toast.error("Failed to open chat");
    }
  };

  //////////////////////////////////////////////////////
  // DELETE CHAT (CONFIRM 🔥)
  //////////////////////////////////////////////////////
  const removeChat = async (chatId: number) => {
    const confirmDelete = window.confirm(
      "⚠️ Are you sure you want to delete this chat?\nThis cannot be undone."
    );

    if (!confirmDelete) return;

    try {
      await deleteChat(chatId);

      if (activeChat === chatId) newChat();

      loadChats();
      toast.success("Chat deleted 🗑️");
    } catch {
      toast.error("Delete failed");
    }
  };

  //////////////////////////////////////////////////////
  // NEW CHAT
  //////////////////////////////////////////////////////
  const newChat = () => {
    setActiveChat(null);
    setMessages([]);
    setVersionId(null);
    setQuestions([]);
    setChatFiles([]);
  };

  //////////////////////////////////////////////////////
  // UPLOAD
  //////////////////////////////////////////////////////
 const upload = async () => {
  const files = fileRef.current?.files;

  if (!files || files.length === 0) {
    return toast.error("Select file(s)");
  }

  setUploading(true);
  toast.loading("Uploading...");

  try {
    for (let file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);

      // 🔥 FIRST TRY (NORMAL UPLOAD)
      const res = await uploadDocument(formData, false);

      //////////////////////////////////////////////////////
      // 🔥 DUPLICATE FILE DETECTED
      //////////////////////////////////////////////////////
      if (res.data.reused) {
        toast.dismiss();

        const action = window.confirm(
          `⚠️ "${file.name}" already exists.\n\nOK → Replace file\nCancel → Continue existing chat`
        );

        //////////////////////////////////////////////////////
        // 🔁 REPLACE FLOW
        //////////////////////////////////////////////////////
        if (action) {
          toast.loading("Replacing document...");

          const replaceRes = await uploadDocument(formData, true);

          toast.dismiss();
          toast.success("File replaced ✅");

          await openChat(replaceRes.data.chatSessionId);
        }

        //////////////////////////////////////////////////////
        // 🔄 CONTINUE EXISTING CHAT
        //////////////////////////////////////////////////////
        else {
          toast.success("Opening existing chat 📂");

          await openChat(res.data.chatSessionId);
        }
      }

      //////////////////////////////////////////////////////
      // ✅ NEW FILE
      //////////////////////////////////////////////////////
      else {
        await openChat(res.data.chatSessionId);
        toast.success("Upload complete 🚀");
      }

      //////////////////////////////////////////////////////
      // 📄 FILE TAG UI UPDATE
      //////////////////////////////////////////////////////
      setChatFiles((prev) =>
        prev.includes(file.name) ? prev : [...prev, file.name]
      );
    }

    loadChats();
  } catch (err: any) {
    toast.dismiss();

    if (!err.response) {
      toast.error("Network timeout. Try smaller PDF.");
    } else {
      toast.error("Upload failed");
    }

    console.error(err);
  } finally {
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }
};

  //////////////////////////////////////////////////////
  // ASK
  //////////////////////////////////////////////////////
  const ask = async () => {
    const finalCourse = course === "Other" ? customCourse : course;

    if (!finalCourse && !versionId) {
      return toast.error("Select course first");
    }

    if (!question.trim() || question.length < 3) {
      return toast.error("Enter valid topic");
    }

    const invalidWords = ["abc", "xyz", "asdf", "mmmm"];
    if (invalidWords.includes(question.toLowerCase())) {
      return toast.error("Invalid topic");
    }

    const tempId = Date.now();

    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user", content: question },
    ]);

    setLoading(true);

    try {
      const res = await askQuestion({
        question,
        versionId: versionId || undefined,
        chatSessionId: activeChat || undefined,
        course: finalCourse,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: tempId + 1,
          role: "assistant",
          content: res.data.answer,
        },
      ]);

      setQuestion("");
      loadChats();
    } catch {
      toast.error("Failed");
    } finally {
      setLoading(false);
    }
  };

  //////////////////////////////////////////////////////
  // AUTO SCROLL
  //////////////////////////////////////////////////////
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  //////////////////////////////////////////////////////
  // UI
  //////////////////////////////////////////////////////
  return (
    
<div className="h-screen flex flex-col overflow-hidden">
      {/* 🔥 HEADER */}
     <Header/>

      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR */}
        <div className="w-72 bg-gray-900 text-white flex flex-col">
          <div className="p-4 font-bold border-b">📚 Chats</div>

          <button onClick={newChat} className="m-3 bg-blue-600 py-2 rounded">
            + New Chat
          </button>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => openChat(chat.id)}
                className={`p-3 rounded cursor-pointer ${
                  activeChat === chat.id ? "bg-blue-600" : "bg-gray-800"
                }`}
              >
                <div className="flex justify-between">
                  <div>
                    <p>{chat.title || "New Chat"}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(chat.createdAt).toLocaleString()}
                    </p>
                  </div>

                <button
  onClick={(e) => {
    e.stopPropagation();
    removeChat(chat.id);
  }}
  className="p-1 rounded hover:bg-red-100 transition"
>
  <Trash2 size={18} className="text-red-500 hover:text-red-700" />
</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* MAIN */}
        <div className="flex-1 flex flex-col">

          {/* HEADER */}
          <div className="flex items-center gap-3 p-3 bg-gray-100">
            <button
              onClick={() =>
                activeChat ? newChat() : window.history.back()
              }
              className="px-3 py-1 bg-gray-300 rounded"
            >
              ⬅ Back
            </button>


            <div className="text-sm text-gray-600">
              {versionId ? "📄 Document Mode" : "📘 Course Mode"}
            </div>
            {/* QUESTIONS DROPDOWN */}
<select
  onChange={(e) => {
    const el = document.getElementById(e.target.value);
    el?.scrollIntoView({ behavior: "smooth" });
  }}
  className="ml-auto border p-2 rounded"
>
  <option>
    {questions.length === 0
      ? "No questions yet"
      : "Jump to question"}
  </option>

  {questions.map((q) => (
    <option key={q.id} value={`msg-${q.id}`}>
      {q.content.slice(0, 40)}
    </option>
  ))}
</select>
          </div>

          {/* FILES */}
          {chatFiles.length > 0 && (
            <div className="p-2 bg-yellow-100 flex gap-2 flex-wrap">
              {chatFiles.map((file, i) => (
                <span key={i} className="bg-yellow-300 px-2 py-1 rounded">
                  📄 {file}
                </span>
              ))}
            </div>
          )}

          {/* CHAT */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg) => (
             <div
  id={`msg-${msg.id}`} // ✅ IMPORTANT
  key={msg.id}
  className={`flex ${
    msg.role === "user" ? "justify-end" : "justify-start"
  }`}
>
                <div className="bg-white p-3 rounded shadow max-w-xl">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            ))}

            {loading && <p>🤖 Generating...</p>}
            <div ref={bottomRef}></div>
          </div>

          {/* INPUT */}
          <div className="p-4 bg-white border-t flex gap-2 items-center">
            <input type="file" ref={fileRef} multiple />

            <button
              onClick={upload}
              disabled={uploading}
              className="bg-green-600 text-white px-3 py-2 rounded"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>

            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="flex-1 border p-2 rounded"
              placeholder="Ask topic..."
            />

            <button
              onClick={ask}
              disabled={loading}
              className="bg-blue-600 text-white px-4"
            >
              Ask
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}