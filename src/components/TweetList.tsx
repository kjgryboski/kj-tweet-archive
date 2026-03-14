import Tweet, { TweetProps } from "./Tweet";
import { motion } from "framer-motion";
import { Box, Container, Typography, CircularProgress } from "@mui/material";
import { styled, Theme } from "@mui/material/styles";

interface TweetListProps {
  tweets: TweetProps[];
  isLoading: boolean;
  searchTerm?: string;
  loadingMore?: boolean;
}

const AnimatedText = styled(motion.div)({
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
});

const TweetContainer = styled(Box)(({ theme }: { theme: Theme }) => ({
  height: "100%",
  padding: theme.spacing(1),
}));

const MonoTypography = styled(Typography)({
  fontFamily: '"Roboto Mono", "Courier New", monospace',
});

export default function TweetList({ tweets, isLoading, searchTerm = "", loadingMore = false }: TweetListProps) {
  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "50vh",
        }}
      >
        <AnimatedText
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <CircularProgress size={24} sx={{ mr: 2 }} />
          <MonoTypography variant="h6">Loading tweets...</MonoTypography>
        </AnimatedText>
      </Box>
    );
  }

  if (tweets.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "50vh",
        }}
      >
        <AnimatedText
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <MonoTypography variant="h6" sx={{ mb: 2 }}>
            No tweets found
          </MonoTypography>
          <MonoTypography
            variant="body1"
            color="text.secondary"
            textAlign="center"
            sx={{ maxWidth: "600px", px: 3 }}
          >
            There are no tweets currently available. Please check back later.
          </MonoTypography>
        </AnimatedText>
      </Box>
    );
  }

  return (
    <Box sx={{ width: "100%", pb: 6, display: "flex", justifyContent: "center" }}>
      <Container
        maxWidth="xl"
        sx={{
          width: "90%",
          px: { xs: 1, sm: 2, md: 3 },
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(3, 1fr)",
            },
            gap: 1,
          }}
        >
          {tweets.map((tweet) => (
            <TweetContainer key={tweet.id}>
              <Tweet {...tweet} searchTerm={searchTerm} />
            </TweetContainer>
          ))}
        </Box>
        {loadingMore && (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 4 }}>
            <CircularProgress size={20} sx={{ mr: 1 }} />
            <MonoTypography variant="body2">Loading more...</MonoTypography>
          </Box>
        )}
      </Container>
    </Box>
  );
}
