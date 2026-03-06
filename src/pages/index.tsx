import { useState, useEffect } from "react";
import Head from "next/head";
import { Box, Container, Typography } from "@mui/material";
import { styled, Theme } from "@mui/material/styles";
import { TweetProps } from "@/components/Tweet";
import TweetList from "@/components/TweetList";
import BackToTop from "@/components/BackToTop";
import ThemeToggle from "@/components/ThemeToggle";
import SearchBar from "@/components/SearchBar";
import { fetchUserTweets } from "@/lib/api";
import { useThemeContext } from "@/lib/theme-context";
import Script from "next/script";

const HeaderContainer = styled(Box)(({ theme }: { theme: Theme }) => ({
  borderBottom: `1px solid ${theme.palette.divider}`,
  paddingTop: theme.spacing(6),
  paddingBottom: theme.spacing(3),
}));

export default function Home() {
  const [tweets, setTweets] = useState<TweetProps[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { colorMode, toggleColorMode } = useThemeContext();

  useEffect(() => {
    loadTweets();
  }, []);

  const loadTweets = async () => {
    setIsLoading(true);
    try {
      const fetchedTweets = await fetchUserTweets();
      setTweets(fetchedTweets);
    } catch (error) {
      console.error("Error loading tweets:", error);
      setTweets([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
  };

  return (
    <>
      <Script async src="https://www.googletagmanager.com/gtag/js?id=G-TQ17DS73DL"></Script>
      <Script>
        {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-TQ17DS73DL');`}
      </Script>
      <Head>
        <title>KJ Tweets</title>
        <meta
          name="description"
          content="View KJ tweets in a minimal, distraction-free interface"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/kj.jpg" type="image/jpeg" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
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
              component="h1"
              fontWeight="bold"
              textAlign="center"
              sx={{ mb: 1 }}
            >
              The Archive
            </Typography>
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
          {!isLoading && tweets.length > 0 && <SearchBar tweets={tweets} onSearch={handleSearch} />}
        </Container>

        <TweetList tweets={tweets} isLoading={isLoading} searchTerm={searchTerm} />
        <BackToTop />
        <ThemeToggle toggleColorMode={toggleColorMode} mode={colorMode} />
      </Box>
    </>
  );
}
