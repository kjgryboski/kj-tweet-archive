import { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import React from "react";
import { Box, Container, Typography } from "@mui/material";
import { styled, Theme } from "@mui/material/styles";
import Tweet, { TweetProps } from "@/components/Tweet";
import BackToTop from "@/components/BackToTop";
import ThemeToggle from "@/components/ThemeToggle";
import { useThemeContext } from "@/lib/theme-context";
import { getThreadParts } from "@/lib/db";

interface ThreadPageProps {
  rootId: string;
  parts: TweetProps[];
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

export const getServerSideProps: GetServerSideProps<ThreadPageProps> = async ({
  params,
  res,
}) => {
  const rootId = params?.rootId as string;
  if (!rootId) return { notFound: true };

  const parts = await getThreadParts(rootId);
  if (parts.length === 0) return { notFound: true };

  res.setHeader(
    "Cache-Control",
    "public, s-maxage=86400, stale-while-revalidate=3600",
  );

  return { props: { rootId, parts } };
};

export default function ThreadPage({ parts }: ThreadPageProps) {
  const { colorMode, toggleColorMode } = useThemeContext();
  const root = parts[0];
  const headTitle = (root.title || root.text).slice(0, 80);
  const headDesc =
    root.text.length > 200 ? root.text.slice(0, 197) + "..." : root.text;

  return (
    <>
      <Head>
        <title>Thread — {headTitle} — KJ Tweets</title>
        <meta name="description" content={headDesc} />
        <meta property="og:title" content={`Thread — ${headTitle}`} />
        <meta property="og:description" content={headDesc} />
        <meta property="og:type" content="article" />
      </Head>

      <Box component="main" sx={{ minHeight: "100vh" }}>
        <Container maxWidth="sm" sx={{ pt: 4, pb: 2 }}>
          <Link href="/" passHref legacyBehavior>
            <BackLink>← Back to Archive</BackLink>
          </Link>
        </Container>

        <Container maxWidth="sm" sx={{ pb: 4 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            fontFamily='"Roboto Mono", "Courier New", monospace'
            sx={{ display: "block", mb: 2 }}
          >
            Thread · {parts.length} tweets
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {parts.map((t) => (
              <Tweet key={t.id} {...t} fullText />
            ))}
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
