"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { downloadPPT } from "@/utils/downloadPPT";
import Header from "@/components/Header";
export default function PPTPage() {
  const router = useRouter();

  const [course, setCourse] = useState("");
  const [customCourse, setCustomCourse] = useState("");
  const [topic, setTopic] = useState("");
  const [slides, setSlides] = useState(5);

  const [loading, setLoading] = useState(false);
  const [controller, setController] = useState<AbortController | null>(null);

  const [data, setData] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  const finalCourse =
    course === "Other" ? customCourse.trim() : course;

  
  // AUTH CHECK
  
  useEffect(() => {
    const checkAuth = async () => {
      try {
        await axios.get("http://localhost:5000/auth/me", {
          withCredentials: true,
        });
      } catch {
        toast.error("Please login first");
        window.location.href = "/login";
      }
    };

    checkAuth();
  }, []);

  
  // GENERATE PPT
  
  const handleGenerate = async () => {
  if (!finalCourse || !topic) {
    toast.error("Enter course & topic");
    return;
  }

  if (slides < 8 || slides > 15) {
    toast.error("Slides count should be between 8 and 15");
    return;
  }

  const ctrl = new AbortController();
  setController(ctrl);

  setLoading(true);
  toast.loading("Generating PPT...");
    try {
      const res = await axios.post(
        "http://localhost:5000/tutor/generate-ppt",
        {
          course: finalCourse,
          topic,
          slides,
        },
        {
          signal: ctrl.signal,
          withCredentials: true,
        }
      );

      setData(res.data);

      toast.dismiss();
      toast.success(" PPT Generated!");

    } catch (e: any) {
      toast.dismiss();

      if (axios.isCancel(e)) {
        toast.error(" Stopped");
      } else {
        toast.error("Failed");
      }
    } finally {
      setLoading(false);
    }
  };

  
  //  STOP
  
  const handleStop = () => {
    controller?.abort();
    setLoading(false);
  };

  
  //  DOWNLOAD
  
  const handleDownload = () => {
    downloadPPT(data.file);
    toast.success("Downloaded!");

    // reset clean
    setData(null);
    setShowPreview(false);
  };

  
  //  UI
  
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">

      {/*  HEADER */}
      <Header />

    

      {/*  MAIN */}
      <div className="flex flex-col items-center p-6 gap-6">

        {/* CARD */}
        <div className="bg-white shadow-xl rounded-xl p-6 w-[400px] space-y-4">

          <select
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            className="p-3 border rounded-lg w-full"
          >
            <option value="">Select Course</option>
            <option value="CSE">CSE</option>
            <option value="ECE">ECE</option>
            <option value="Other">Other</option>
          </select>

          {course === "Other" && (
            <input
              placeholder="Enter course"
              value={customCourse}
              onChange={(e) => setCustomCourse(e.target.value)}
              className="p-3 border rounded-lg w-full"
            />
          )}

          <input
            placeholder="Topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="p-3 border rounded-lg w-full"
          />

          <input
            type="number"
            value={slides}
            onChange={(e) => {
  const value = e.target.value;

  if (value === "") {
    setSlides(0); // or null if you prefer
  } else {
    setSlides(Number(value));
  }
}}
            className="p-3 border rounded-lg w-full"
          />

          {/* BUTTON FLOW */}

          {!data && !loading && (
            <button
              onClick={handleGenerate}
              className="bg-blue-600 text-white py-3 rounded-lg w-full hover:bg-blue-700"
            >
              Generate PPT
            </button>
          )}

          {loading && (
            <>
              <button
                disabled
                className="bg-blue-400 text-white py-3 rounded-lg w-full"
              >
                Generating...
              </button>

              <button
                onClick={handleStop}
                className="bg-red-500 text-white py-2 rounded-lg w-full"
              >
                Stop
              </button>
            </>
          )}

          {!loading && data && (
            <>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="bg-indigo-600 text-white py-3 rounded-lg w-full"
              >
                {showPreview ? "Hide Preview" : "Preview Slides"}
              </button>

              <button
                onClick={handleDownload}
                className="bg-green-600 text-white py-3 rounded-lg w-full"
              >
                Download PPT
              </button>
            </>
          )}
        </div>

        {/* PREVIEW */}
        {showPreview && data && (
          <div className="w-full max-w-6xl">

            <h2 className="text-xl font-bold text-center mb-4">
              Slides Preview
            </h2>

            <div className="flex gap-4 overflow-x-auto p-4">

              {data.slides?.map((s: any, i: number) => (
                <div
                  key={i}
                  className="min-w-[280px] bg-white shadow-md rounded-lg p-4"
                >
                  <h3 className="font-bold text-blue-600 mb-2">
                    {s.heading}
                  </h3>

                  <ul className="text-sm space-y-1">
                    {s.points?.map((p: string, j: number) => (
                      <li key={j} className="list-disc ml-4">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

            </div>
          </div>
        )}

      </div>
    </div>
  );
}