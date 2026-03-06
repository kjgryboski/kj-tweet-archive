# Dependency Fix for Sanity Integration

## Changes Made

1. **Downgraded React to version 18**

   - Changed `react` from `^19.0.0` to `^18.2.0`
   - Changed `react-dom` from `^19.0.0` to `^18.2.0`
   - Updated TypeScript types from `@types/react` version 19 to version 18

2. **Added NPM Configuration**

   - Created `.npmrc` file with settings to handle peer dependency issues
   - Set `legacy-peer-deps=true` to avoid peer dependency conflicts

3. **Added Deployment Configurations**
   - Created `vercel.json` for Vercel deployments

## Why These Changes Were Needed

The Sanity libraries have the following peer dependencies:

- `@sanity/icons` requires React 18
- `next-sanity` depends on `@sanity/icons`
- `@sanity/preview-kit` requires React 18

When using React 19, these dependencies conflict and cause build failures. Downgrading to React 18 resolves these conflicts and ensures compatibility with the Sanity ecosystem.

## Future Considerations

As Sanity updates their libraries to support React 19, you might be able to upgrade back to React 19. Keep an eye on the following packages for updates:

- `next-sanity`
- `@sanity/icons`
- `@sanity/preview-kit`
