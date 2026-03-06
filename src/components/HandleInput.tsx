import { useState, FormEvent } from "react";
import { motion } from "framer-motion";

interface HandleInputProps {
  onSubmit: (handle: string) => void;
  isLoading: boolean;
}

export default function HandleInput({ onSubmit, isLoading }: HandleInputProps) {
  const [handle, setHandle] = useState("KJFUTURES");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    // Clean up the handle (remove @ if present)
    const cleanHandle = handle.trim().replace(/^@/, "");

    if (cleanHandle) {
      onSubmit(cleanHandle);
    }
  };

  return (
    <motion.div
      className="min-h-[90vh] flex flex-col items-center justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <h1 className="text-3xl md:text-4xl font-bold mb-8 text-center">Minimal Tweet Viewer</h1>

      <form onSubmit={handleSubmit} className="w-full max-w-md">
        <div className="flex flex-col space-y-4">
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="Enter Twitter handle (e.g., elonmusk)"
            className="px-4 py-3 border border-gray-300 focus:outline-none focus:ring-1 focus:ring-black rounded-none text-lg"
            disabled={isLoading}
          />

          <button
            type="submit"
            className={`bg-black text-white px-4 py-3 rounded-none text-lg ${
              isLoading ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-800"
            }`}
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "View Tweets"}
          </button>
        </div>
      </form>
    </motion.div>
  );
}
