import { createClient } from "next-sanity";
import imageUrlBuilder from "@sanity/image-url";

// Default values to use when environment variables are not set
// Replace with your actual Sanity project ID after setting up your project
const defaultProjectId = "your-project-id";
const defaultDataset = "production";

// Check if we have a projectId from environment variables or use fallback
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || defaultProjectId;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || defaultDataset;

// Show warning if using default values in development
if (process.env.NODE_ENV !== "production") {
  if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID) {
    console.warn(
      "Warning: No NEXT_PUBLIC_SANITY_PROJECT_ID environment variable found. Using default projectId."
    );
  }
}

// Create the Sanity client
export const client = createClient({
  projectId,
  dataset,
  apiVersion: "2023-05-03", // use a UTC date string
  useCdn: process.env.NODE_ENV === "production",
  token: process.env.SANITY_API_TOKEN, // Only needed if you're accessing non-public data
  perspective: "published", // Explicitly state we want published content
  ignoreBrowserTokenWarning: true, // Ignore warnings about using tokens in the browser
});

// Helper function for generating image URLs from Sanity image references
const builder = imageUrlBuilder(client);

export function urlFor(source: Record<string, unknown>) {
  return builder.image(source);
}

// Fetch tweets from Sanity
export async function fetchTweetsFromCMS() {
  try {
    return await client.fetch(`
      *[_type == "tweet"] | order(createdAt desc) {
        _id,
        title,
        message,
        xLink,
        createdAt,
        username,
        name,
      }
    `);
  } catch (error) {
    console.error("Error fetching from Sanity:", error);
    throw error;
  }
}
