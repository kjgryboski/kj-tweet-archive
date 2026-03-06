import { TweetProps } from "../components/Tweet";
import { fetchTweetsFromCMS } from "./sanity";

// Define a more specific type for Sanity tweets
interface SanityTweet {
  _id: string;
  title: string;
  message: string;
  xLink: string;
  createdAt: string;
  username: string;
  name: string;
}

// Sample tweet for when no tweets exist (used in development or when CMS isn't connected yet)
const SAMPLE_TWEET: TweetProps = {
  id: "sample-1",
  title: "Sample Tweet",
  text: "This is a sample tweet that appears when no tweets are found in the CMS. Add tweets to your Sanity CMS to replace this.",
  createdAt: new Date().toISOString(),
  username: "KJFUTURES",
  name: "KJ",
  xLink: "https://twitter.com/example",
};

export async function fetchUserTweets(): Promise<TweetProps[]> {
  try {
    // Fetch tweets from Sanity CMS
    const cmsTweets = (await fetchTweetsFromCMS()) as SanityTweet[];

    if (cmsTweets && cmsTweets.length > 0) {
      // Map Sanity data to match our TweetProps interface
      return cmsTweets.map((tweet: SanityTweet) => ({
        id: tweet._id,
        text: tweet.message,
        title: tweet.title,
        createdAt: tweet.createdAt,
        username: tweet.username || "KJFUTURES",
        name: tweet.name || "KJ",
        xLink: tweet.xLink,
      }));
    }

    // Return a sample tweet in development if no tweets are found
    return process.env.NODE_ENV === "development" ? [SAMPLE_TWEET] : [];
  } catch (error) {
    console.error("Error fetching from CMS:", error);

    // Return a sample tweet in development if there's an error
    return process.env.NODE_ENV === "development" ? [SAMPLE_TWEET] : [];
  }
}
