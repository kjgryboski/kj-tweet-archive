import { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import React, { useState } from "react";
import { Box, Container, Typography, IconButton, Tooltip } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import { styled, Theme } from "@mui/material/styles";
import Tweet, { TweetProps } from "@/components/Tweet";
import BackToTop from "@/components/BackToTop";
import ThemeToggle from "@/components/ThemeToggle";
import { useThemeContext } from "@/lib/theme-context";
import { ensureSchema, getTweetById } from "@/lib/db";

interface TweetPageProps {
  tweet: TweetProps;
}

const BackLink = styled("a")(({ theme }: { theme: Theme }) => ({
  fontFamily: '"Roboto Mono", "Courier New", monospace',
  fontSize: "0.9rem",
  color: theme.palette.text.secondary,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  "&:hover": {
    color: theme.palette.text.primary,
  },
}));

export const getServerSideProps: GetServerSideProps = async ({ params, res }) => {
  const id = params?.id as string;

  if (!id) return { notFound: true };

  await ensureSchema();
  const tweet = await getTweetById(id);

  if (!tweet) return { notFound: true };

  res.setHeader(
    "Cache-Control",
    "public, s-maxage=86400, stale-while-revalidate=3600"
  );

  return { props: { tweet } };
};

export default function TweetPage({ tweet }: TweetPageProps) {
  const { colorMode, toggleColorMode } = useThemeContext();
  const [copied, setCopied] = useState(false);

  const shareUrl = `https://kjtweets.com/tweet/${tweet.id}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const ogDescription = tweet.text.length > 200
    ? tweet.text.substring(0, 197) + "..."
    : tweet.text;

  const ogTitle = tweet.title && tweet.title !== tweet.text.trim() && !tweet.text.trim().startsWith(tweet.title)
    ? tweet.title
    : tweet.text.substring(0, 80);

  return (
    <>
      <Head>
        <title>{ogTitle} — KJ Tweets</title>
        <meta name="description" content={ogDescription} />
        <meta property="og:title" content={ogTitle} />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:image" content="https://kjtweets.com/og-card.png" />
        <meta property="og:url" content={`https://kjtweets.com/tweet/${tweet.id}`} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@KJFUTURES" />
      </Head>

      <Box component="main" sx={{ minHeight: "100vh" }}>
        <Container
          maxWidth="sm"
          sx={{ pt: 4, pb: 2 }}
        >
          <Link href="/" passHref legacyBehavior>
            <BackLink>
              ← Back to Archive
            </BackLink>
          </Link>
        </Container>

        <Container
          maxWidth="sm"
          sx={{ pb: 4 }}
        >
          <Tweet {...tweet} fullText />
          <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
            <Tooltip title={copied ? "Copied!" : "Copy link"} placement="top">
              <IconButton
                onClick={copyToClipboard}
                size="small"
                sx={{
                  fontFamily: '"Roboto Mono", monospace',
                  fontSize: "0.8rem",
                  borderRadius: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  px: 2,
                  py: 0.5,
                  gap: 0.5,
                  color: "text.secondary",
                  "&:hover": { color: "text.primary" },
                }}
              >
                {copied ? <CheckIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
                {copied ? "Copied" : "Share"}
              </IconButton>
            </Tooltip>
          </Box>
        </Container>

        <Box
          component="footer"
          sx={{
            textAlign: "center",
            py: 4,
            mt: 4,
            borderTop: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        >
          <Typography
            variant="body2"
            color="text.secondary"
            fontFamily='"Roboto Mono", "Courier New", monospace'
          >
            Built by{" "}
            <a
              href="https://x.com/KJFUTURES"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit" }}
            >
              @KJFUTURES
            </a>
          </Typography>
        </Box>

        <BackToTop />
        <ThemeToggle toggleColorMode={toggleColorMode} mode={colorMode} />
      </Box>
    </>
  );
}
