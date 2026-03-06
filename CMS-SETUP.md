# Setting Up Sanity CMS for Tweet Archive

This guide will help you set up Sanity CMS to manage tweet content for your project.

## 1. Install Required Packages

These packages have already been added to your package.json. Run:

```bash
npm install
```

## 2. Create a Sanity Project

1. Visit [sanity.io](https://www.sanity.io/) and create an account if you don't have one.
2. Create a new project from your Sanity dashboard.
3. Copy your Project ID from the Sanity dashboard.

## 3. Set Up Environment Variables

Create a `.env.local` file in the root directory with the following content:

```
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_TOKEN=your_sanity_api_token  # Optional, needed for writing to Sanity from the app
```

## 4. Initialize Sanity Studio

Run the following command to initialize Sanity Studio:

```bash
npm install -g @sanity/cli
sanity init
```

When prompted:

- Select "Create a new project"
- Enter a project name
- Use the default dataset configuration
- Select "Clean project with no predefined schemas"

## 5. Deploy Sanity Studio

To deploy your Sanity Studio:

```bash
cd studio
sanity deploy
```

This will give you a URL where you can access the Sanity Studio to manage your tweet content.

## 6. Using the CMS

Once set up, you can use Sanity Studio to:

- Add new tweets with titles, messages, and X links
- Edit existing tweets
- Delete tweets

The app will automatically fetch content from Sanity CMS and display it on your site.

## Structure

Each tweet in the CMS includes:

- **Title**: A title for the tweet (displayed at the top)
- **Message**: The main content of the tweet
- **X Link**: Direct link to the original tweet on X (Twitter)
- **Created At**: Date and time when the tweet was posted
- **Username**: The X username (without @)
- **Name**: Display name of the account
- **Profile Image URL**: URL to the profile image (optional)

## Fallback

If there's any issue connecting to Sanity or if no tweets are found, the app will fall back to the hardcoded tweets in `src/lib/api.ts`.
