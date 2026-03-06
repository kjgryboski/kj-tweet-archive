import { defineConfig } from "sanity";
import { deskTool } from "sanity/desk";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./src/lib/schema";

export default defineConfig({
  name: "cryptoskj-tweet-archive",
  title: "CryptosKJ Tweet Archive",

  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "kin6kwl0",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",

  plugins: [deskTool(), visionTool()],

  schema: {
    types: [schemaTypes.tweetSchema],
  },
});
