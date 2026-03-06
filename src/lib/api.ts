import { TweetProps } from "../components/Tweet";
import { getTweets } from "./db";

export async function fetchUserTweets(): Promise<TweetProps[]> {
  try {
    return await getTweets();
  } catch (error) {
    console.error("Error fetching tweets:", error);
    return [];
  }
}
