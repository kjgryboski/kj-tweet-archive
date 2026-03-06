import { createClient } from "next-sanity";
import imageUrlBuilder from "@sanity/image-url";

const projectId = "kin6kwl0";
const dataset = "production";

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
