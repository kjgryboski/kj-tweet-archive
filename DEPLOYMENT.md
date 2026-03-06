# Deploying to Vercel

This guide will help you deploy your Sanity-integrated Next.js application to Vercel.

## Prerequisites

1. A Sanity.io account and project
2. A Vercel account
3. Your code pushed to a Git repository (GitHub, GitLab, or Bitbucket)

## Setting up Environment Variables in Vercel

1. Go to your Vercel dashboard
2. Select your project
3. Click on the "Settings" tab
4. Click on "Environment Variables"
5. Add the following environment variables:

   | Name                            | Value             | Description                                                    |
   | ------------------------------- | ----------------- | -------------------------------------------------------------- |
   | `NEXT_PUBLIC_SANITY_PROJECT_ID` | `your-project-id` | Your Sanity project ID (find in sanity.io dashboard)           |
   | `NEXT_PUBLIC_SANITY_DATASET`    | `production`      | Your Sanity dataset name (usually "production")                |
   | `SANITY_API_TOKEN`              | `your-token`      | (Optional) Your Sanity API token if accessing private datasets |

6. Make sure to set these variables for all environments (Production, Preview, and Development)

## Deploy Settings

In your Vercel project settings, ensure the following:

1. **Framework Preset**: Next.js
2. **Build Command**: `npm run build`
3. **Output Directory**: `.next`
4. **Node.js Version**: 18.x or later

## Troubleshooting

If you encounter deployment issues:

1. **Check environment variables**: Make sure they're correctly set in Vercel
2. **Verify Sanity project ID**: The project ID must only contain lowercase letters, numbers, and dashes
3. **Check build logs**: Look for specific error messages in the Vercel deployment logs

## Local Testing

Before deploying, test your environment variables locally:

1. Copy `.env.local.example` to `.env.local`
2. Fill in your actual Sanity project details
3. Run `npm run dev` to test locally

## Important Notes

- The project includes fallback behavior to handle missing environment variables, but for production, always set the proper values in Vercel
- If you change your Sanity schema, you may need to redeploy your application
