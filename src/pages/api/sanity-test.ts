import type { NextApiRequest, NextApiResponse } from "next";
import { client } from "@/lib/sanity";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Add environment variables to the response for debugging
    const envVars = {
      projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
      dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
      nodeEnv: process.env.NODE_ENV,
      hasToken: !!process.env.SANITY_API_TOKEN,
    };

    // Test a simple Sanity GROQ query
    const result = await client.fetch(`*[_type == "tweet"][0...5]`);

    // Return debug information
    res.status(200).json({
      message: "Sanity connection test",
      environment: envVars,
      sanityData: result || [],
      clientConfig: {
        projectId: client.config().projectId,
        dataset: client.config().dataset,
        apiVersion: client.config().apiVersion,
        useCdn: client.config().useCdn,
      },
    });
  } catch (error) {
    console.error("Sanity test error:", error);
    res.status(500).json({
      error: "Failed to connect to Sanity",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
