import { useState, useEffect, useRef, useCallback } from "react";
import Head from "next/head";
import { Box, Container, Typography, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { styled, Theme } from "@mui/material/styles";
import { TweetProps } from "@/components/Tweet";
import TweetList from "@/components/TweetList";
import BackToTop from "@/components/BackToTop";
import ThemeToggle from "@/components/ThemeToggle";
import SearchBar from "@/components/SearchBar";
import { useThemeContext } from "@/lib/theme-context";
import { GoogleAnalytics } from "@next/third-parties/google";

const HeaderContainer = styled(Box)(({ theme }: { theme: Theme }) => ({
  borderBottom: `1px solid ${theme.palette.divider}`,
  paddingTop: theme.spacing(6),
  paddingBottom: theme.spacing(3),
}));

export default function Home() {
  const [tweets, setTweets] = useState<TweetProps[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<TweetProps[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const { colorMode, toggleColorMode } = useThemeContext();
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<"newest" | "oldest" | "likes">("newest");
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const loadingRef = useRef(false);

  const loadTweets = useCallback(async (cursor?: string) => {
    if (cursor && loadingRef.current) return;
    loadingRef.current = true;

    if (cursor) {
      setLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    try {
      const params = new URLSearchParams({ limit: "30", sort });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/tweets?${params}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();

      setError(null);
      if (cursor) {
        setTweets((prev) => [...prev, ...data.tweets]);
      } else {
        setTweets(data.tweets);
      }
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
      if (data.totalCount !== undefined) setTotalCount(data.totalCount);
    } catch (err) {
      console.error("Error loading tweets:", err);
      setError("Failed to load tweets. Please try again.");
      if (!cursor) setTweets([]);
    } finally {
      setIsLoading(false);
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [sort]);

  const handleSortChange = (_: React.MouseEvent<HTMLElement>, newSort: "newest" | "oldest" | "likes" | null) => {
    if (newSort === null) return;
    setSort(newSort);
    setTweets([]);
    setNextCursor(null);
    setHasMore(true);
  };

  useEffect(() => {
    loadTweets();
  }, [loadTweets]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loadingMore || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && nextCursor) {
          loadTweets(nextCursor);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, isLoading, nextCursor, loadTweets]);

  const handleServerSearch = useCallback(async (term: string) => {
    setSearchTerm(term);
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ q: term, limit: "100" });
      const res = await fetch(`/api/tweets?${params}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setSearchResults(data.tweets);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchTerm("");
    setSearchResults(null);
  }, []);

  return (
    <>
      {process.env.NEXT_PUBLIC_GA_ID && <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />}
      <Head>
        <title>KJ Tweets</title>
        <meta
          name="description"
          content="View KJ tweets in a minimal, distraction-free interface"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta property="og:title" content="KJ Tweets — The Archive" />
        <meta property="og:description" content="View KJ tweets in a minimal, distraction-free interface" />
        <meta property="og:image" content="https://kjtweets.com/kj.jpg" />
        <meta property="og:url" content="https://kjtweets.com" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:site" content="@KJFUTURES" />
      </Head>

      <Box component="main" sx={{ minHeight: "100vh" }}>
        <Container
          maxWidth="md"
          sx={{
            width: {
              xs: "100%",
              sm: "80%",
              md: "60%",
              lg: "50%",
              xl: "40%",
            },
          }}
        >
          <HeaderContainer>
            <Typography
              variant="h3"
              component="h1"
              fontWeight="bold"
              textAlign="center"
              sx={{ mb: 1 }}
            >
              KJ Tweets
            </Typography>
            <Typography
              variant="h5"
              component="h2"
              fontWeight="bold"
              textAlign="center"
              sx={{ mb: 1 }}
            >
              The Archive
            </Typography>
            {totalCount !== null && (
              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
                fontFamily='"Roboto Mono", monospace'
              >
                {totalCount.toLocaleString()} tweets archived
              </Typography>
            )}
          </HeaderContainer>
        </Container>

        <Container
          maxWidth="md"
          sx={{
            width: {
              xs: "100%",
              sm: "80%",
              md: "60%",
              lg: "50%",
              xl: "40%",
            },
            mt: 2,
            mb: 2,
          }}
        >
          {!isLoading && tweets.length > 0 && (
            <SearchBar
              onServerSearch={handleServerSearch}
              onClear={handleClearSearch}
              resultCount={searchResults?.length}
              isSearching={isSearching}
            />
          )}
          {!isLoading && tweets.length > 0 && (
            <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
              <ToggleButtonGroup
                value={sort}
                exclusive
                onChange={handleSortChange}
                size="small"
              >
                <ToggleButton value="newest" sx={{ fontFamily: '"Roboto Mono", monospace', textTransform: "none", px: 2 }}>
                  Newest
                </ToggleButton>
                <ToggleButton value="oldest" sx={{ fontFamily: '"Roboto Mono", monospace', textTransform: "none", px: 2 }}>
                  Oldest
                </ToggleButton>
                <ToggleButton value="likes" sx={{ fontFamily: '"Roboto Mono", monospace', textTransform: "none", px: 2 }}>
                  Likes
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          )}
        </Container>

        <TweetList
          tweets={searchResults ?? tweets}
          isLoading={isLoading}
          searchTerm={searchTerm}
          loadingMore={loadingMore}
          error={error}
          onRetry={() => { setError(null); loadTweets(); }}
        />
        {hasMore && !isLoading && !searchResults && <div ref={sentinelRef} style={{ height: 1 }} />}
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
