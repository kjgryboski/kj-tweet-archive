// This file defines the schema for Sanity CMS
// To be used in Sanity Studio

export const tweetSchema = {
  name: "tweet",
  title: "Tweet",
  type: "document",
  fields: [
    {
      name: "title",
      title: "Title",
      type: "string",
      description: "A title for the tweet",
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "message",
      title: "Message",
      type: "text",
      description: "The tweet content",
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "xLink",
      title: "X Link",
      type: "url",
      description: "Link to the original tweet on X (Twitter)",
      validation: (Rule: any) =>
        Rule.required().uri({
          scheme: ["https"],
        }),
    },
    {
      name: "createdAt",
      title: "Created At",
      type: "datetime",
      description: "When the tweet was posted",
      validation: (Rule: any) => Rule.required(),
    },
    {
      name: "name",
      title: "Name",
      type: "string",
      description: "The display name of the account",
      validation: (Rule: any) => Rule.required(),
    },
  ],
  preview: {
    select: {
      title: "title",
      subtitle: "message",
    },
  },
};

// Export schema types for Sanity Studio
export const schemaTypes = {
  tweetSchema,
};
