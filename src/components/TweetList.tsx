import Tweet, { TweetProps } from "./Tweet";
import { motion, AnimatePresence } from "framer-motion";
import { Box, Container, Typography, CircularProgress, Skeleton } from "@mui/material";
import { styled, Theme } from "@mui/material/styles";

interface TweetListProps {
  tweets: TweetProps[];
  isLoading: boolean;
  searchTerm?: string;
  loadingMore?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const AnimatedText = styled(motion.div)({
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
});

const TweetContainer = styled(motion.div)(({ theme }: { theme: Theme }) => ({
  height: "100%",
  padding: theme.spacing(1),
}));

const MonoTypography = styled(Typography)({
  fontFamily: '"Roboto Mono", "Courier New", monospace',
});

const SkeletonCard = styled(Box)(({ theme }: { theme: Theme }) => ({
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.spacing(1),
  padding: theme.spacing(2),
  height: "220px",
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(1),
}));

function LoadingSkeleton() {
  return (
    <Box sx={{ width: "100%", pb: 6, display: "flex", justifyContent: "center" }}>
      <Container maxWidth="xl" sx={{ width: "90%", px: { xs: 1, sm: 2, md: 3 } }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" },
            gap: 2,
          }}
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <Box key={i} sx={{ p: 1 }}>
              <SkeletonCard>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Skeleton variant="circular" width={36} height={36} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton width="40%" height={20} />
                    <Skeleton width="60%" height={16} />
                  </Box>
                </Box>
                <Skeleton width="70%" height={24} />
                <Skeleton variant="rectangular" sx={{ flex: 1, borderRadius: 0.5 }} />
                <Skeleton width="20%" height={16} />
              </SkeletonCard>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export default function TweetList({ tweets, isLoading, searchTerm = "", loadingMore = false, error, onRetry }: TweetListProps) {
  if (error) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "50vh",
          gap: 2,
        }}
      >
        <MonoTypography variant="h6">Something went wrong</MonoTypography>
        <MonoTypography variant="body2" color="text.secondary">{error}</MonoTypography>
        {onRetry && (
          <Box
            component="button"
            onClick={onRetry}
            sx={{
              fontFamily: '"Roboto Mono", monospace',
              padding: "8px 24px",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              background: "transparent",
              color: "text.primary",
              cursor: "pointer",
              "&:hover": { opacity: 0.7 },
            }}
          >
            Try Again
          </Box>
        )}
      </Box>
    );
  }

  if (isLoading) {
    return <LoadingSkeleton />;
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
            gap: 2,
          }}
        >
          <AnimatePresence mode="popLayout">
            {tweets.map((tweet, index) => (
              <TweetContainer
                key={tweet.id}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.3, delay: index < 9 ? index * 0.03 : 0 }}
                layout
              >
                <Tweet {...tweet} searchTerm={searchTerm} />
              </TweetContainer>
            ))}
          </AnimatePresence>
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
