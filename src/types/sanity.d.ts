// Sanity Client Configuration
interface SanityClientConfig {
  projectId: string;
  dataset: string;
  apiVersion: string;
  useCdn: boolean;
  token?: string;
  perspective?: string;
  ignoreBrowserTokenWarning?: boolean;
}

// Sanity Client
interface SanityClient {
  config(): SanityClientConfig;
  fetch<T>(query: string): Promise<T>;
}

declare module "next-sanity" {
  export function createClient(config: SanityClientConfig): SanityClient;
}

// Image URL Builder
interface ImageUrlBuilder {
  image(source: Record<string, unknown>): {
    url(): string;
    width(width: number): ImageUrlBuilder;
    height(height: number): ImageUrlBuilder;
    fit(fit: string): ImageUrlBuilder;
  };
}

declare module "@sanity/image-url" {
  export default function imageUrlBuilder(client: SanityClient): ImageUrlBuilder;
}

// Sanity Schema Type
interface SanitySchemaType {
  name: string;
  title: string;
  type: string;
  fields: unknown[];
}

// Sanity Config
interface SanityConfig {
  name: string;
  title: string;
  projectId: string;
  dataset: string;
  plugins: unknown[];
  schema: {
    types: SanitySchemaType[];
  };
}

declare module "sanity" {
  export function defineConfig(config: SanityConfig): SanityConfig;
}

declare module "sanity/desk" {
  export const deskTool: () => unknown;
}

declare module "@sanity/vision" {
  export const visionTool: () => unknown;
}
