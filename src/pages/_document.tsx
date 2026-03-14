import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="preload" as="image" href="/kj.jpg" />
        <link rel="icon" href="/kj.jpg" type="image/jpeg" />
        <link rel="apple-touch-icon" href="/kj.jpg" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
