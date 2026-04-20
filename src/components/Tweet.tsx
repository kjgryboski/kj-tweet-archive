import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import { Card, CardContent, Typography, Box, Avatar } from "@mui/material";
import { styled, Theme } from "@mui/material/styles";
import React, { useRef, useState, useEffect } from "react";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";

export interface TweetMedia {
  mediaKey: string;
  type: "photo" | "video" | "animated_gif";
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface QuotedTweet {
  id: string;
  username?: string;
  name?: string;
  text?: string;
  url?: string;
  createdAt?: string;
}

export interface TweetProps {
  id: string;
  text: string;
  title?: string;
  createdAt: string;
  username: string;
  name: string;
  mediaUrls?: string[];
  media?: TweetMedia[];
  quotedTweet?: QuotedTweet;
  isThreadPart?: boolean;
  threadRootId?: string;
  replyCount?: number;
  retweetCount?: number;
  quoteCount?: number;
  xLink?: string;
  searchTerm?: string;
  likes?: number;
  fullText?: boolean;
}

const StyledCard = styled(Card)(({ theme }: { theme: Theme }) => ({
  padding: theme.spacing(2),
  marginBottom: 0,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.spacing(1),
  boxShadow: "none",
  position: "relative",
  height: "100%",
  minHeight: "180px",
  display: "flex",
  flexDirection: "column",
  transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
  width: "100%",
  minWidth: 0,
  "&:hover": {
    transform: "translateY(-2px)",
    boxShadow: theme.palette.mode === "dark"
      ? "0 4px 12px rgba(255, 255, 255, 0.08)"
      : "0 4px 12px rgba(0, 0, 0, 0.1)",
    borderColor: theme.palette.mode === "dark"
      ? "rgba(255, 255, 255, 0.2)"
      : "rgba(0, 0, 0, 0.2)",
  },
}));

const StyledCardContent = styled(CardContent)({
  padding: 0,
  "&.MuiCardContent-root": {
    padding: 0,
    "&:last-child": {
      paddingBottom: 0,
    },
  },
  display: "flex",
  flexDirection: "column",
  flexGrow: 1,
});

const Title = styled(Typography)(({ theme }: { theme: Theme }) => ({
  fontWeight: 700,
  marginBottom: theme.spacing(1.5),
  paddingBottom: theme.spacing(1.5),
  borderBottom: `1px solid ${theme.palette.divider}`,
  fontFamily: '"Roboto Mono", "Courier New", monospace',
  fontSize: "1.1rem",
  wordBreak: "break-word",
  overflowWrap: "break-word",
  hyphens: "auto",
  [theme.breakpoints.down("sm")]: {
    fontSize: "1rem",
  },
}));

const TweetTextWrapper = styled(Box)<{ fullText?: boolean }>(({ theme, fullText }) => ({
  position: "relative",
  flex: 1,
  maxHeight: fullText ? "none" : "200px",
  overflow: fullText ? "visible" : "hidden",
  "&::after": fullText
    ? {}
    : {
        content: '""',
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "40px",
        background: `linear-gradient(transparent, ${theme.palette.background.paper})`,
        pointerEvents: "none",
      },
  [theme.breakpoints.down("sm")]: {
    maxHeight: "none",
    "&::after": {
      display: "none",
    },
  },
}));

const TweetText = styled(Typography)(({ theme }: { theme: Theme }) => ({
  fontSize: "1rem",
  lineHeight: 1.5,
  letterSpacing: "-0.01em",
  fontFamily: '"Roboto Mono", "Courier New", monospace',
  wordBreak: "break-word",
  overflowWrap: "break-word",
  hyphens: "auto",
  whiteSpace: "pre-wrap",
  [theme.breakpoints.down("sm")]: {
    fontSize: "0.9rem",
  },
}));

const ArchivedBadge = styled(Box)(({ theme }: { theme: Theme }) => ({
  position: "absolute",
  top: theme.spacing(1),
  right: theme.spacing(1),
  fontFamily: '"Roboto Mono", "Courier New", monospace',
  fontSize: "0.65rem",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: theme.palette.text.secondary,
  padding: theme.spacing(0.25, 0.75),
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.spacing(0.5),
  userSelect: "none",
  pointerEvents: "none",
}));

const AnimatedBox = styled(motion.div)({
  width: "100%",
  height: "100%",
});

const HighlightedText = styled("span")(({ theme }: { theme: Theme }) => ({
  backgroundColor:
    theme.palette.mode === "dark" ? "rgba(29, 161, 242, 0.3)" : "rgba(29, 161, 242, 0.2)",
  borderRadius: "2px",
  padding: "1px 2px",
  margin: "0 -2px",
  color: theme.palette.mode === "dark" ? "#fff" : "inherit",
  fontWeight: "bold",
  animation: "search-highlight-pulse 1.5s ease-out infinite",
}));

const QuoteCard = styled(Box)(({ theme }: { theme: Theme }) => ({
  marginTop: theme.spacing(1.5),
  padding: theme.spacing(1.5),
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.spacing(1),
  backgroundColor:
    theme.palette.mode === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
  cursor: "pointer",
  transition: "background-color 0.15s ease",
  "&:hover": {
    backgroundColor:
      theme.palette.mode === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
  },
}));

type MediaLayout = "single" | "double" | "triple" | "quad";

function layoutFor(count: number): MediaLayout | null {
  if (count >= 4) return "quad";
  if (count === 3) return "triple";
  if (count === 2) return "double";
  if (count === 1) return "single";
  return null;
}

function MediaItem({ item, rounded }: { item: TweetMedia; rounded: string }) {
  if (item.type === "video") {
    return (
      <Box
        component="video"
        src={item.url}
        poster={item.thumbnailUrl}
        controls
        playsInline
        preload="metadata"
        sx={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          borderRadius: rounded,
          backgroundColor: "#000",
        }}
      />
    );
  }
  if (item.type === "animated_gif") {
    return (
      <Box
        component="video"
        src={item.url}
        autoPlay
        loop
        muted
        playsInline
        sx={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          borderRadius: rounded,
          backgroundColor: "#000",
        }}
      />
    );
  }
  return (
    <Image
      src={item.url}
      alt="Tweet media"
      fill
      sizes="(max-width: 600px) 100vw, 600px"
      style={{ objectFit: "cover", borderRadius: rounded }}
    />
  );
}

function MediaGrid({ media }: { media: TweetMedia[] }) {
  const layout = layoutFor(media.length);
  if (!layout) return null;
  const gap = 2;

  if (layout === "single") {
    const item = media[0];
    const ratio =
      item.width && item.height ? `${item.width} / ${item.height}` : "16 / 9";
    return (
      <Box
        sx={{
          position: "relative",
          width: "100%",
          aspectRatio: ratio,
          maxHeight: 420,
          mt: 1.5,
          overflow: "hidden",
          borderRadius: "12px",
        }}
      >
        <MediaItem item={item} rounded="12px" />
      </Box>
    );
  }

  if (layout === "double") {
    return (
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: `${gap}px`,
          mt: 1.5,
          height: 260,
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        {media.slice(0, 2).map((m) => (
          <Box key={m.mediaKey} sx={{ position: "relative", height: "100%" }}>
            <MediaItem item={m} rounded="0" />
          </Box>
        ))}
      </Box>
    );
  }

  if (layout === "triple") {
    return (
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: `${gap}px`,
          mt: 1.5,
          height: 320,
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <Box sx={{ position: "relative", gridRow: "1 / span 2" }}>
          <MediaItem item={media[0]} rounded="0" />
        </Box>
        <Box sx={{ position: "relative" }}>
          <MediaItem item={media[1]} rounded="0" />
        </Box>
        <Box sx={{ position: "relative" }}>
          <MediaItem item={media[2]} rounded="0" />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        gap: `${gap}px`,
        mt: 1.5,
        height: 320,
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {media.slice(0, 4).map((m) => (
        <Box key={m.mediaKey} sx={{ position: "relative" }}>
          <MediaItem item={m} rounded="0" />
        </Box>
      ))}
    </Box>
  );
}

function QuotedTweetCard({ quote }: { quote: QuotedTweet }) {
  const openQuote = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (quote.url) window.open(quote.url, "_blank");
  };
  return (
    <QuoteCard onClick={openQuote} role="link" aria-label="View quoted tweet">
      <Box sx={{ display: "flex", alignItems: "center", mb: 0.5, gap: 0.75 }}>
        {quote.name && (
          <Typography
            variant="caption"
            fontWeight="bold"
            fontFamily='"Roboto Mono", "Courier New", monospace'
            noWrap
          >
            {quote.name}
          </Typography>
        )}
        {quote.username && (
          <Typography
            variant="caption"
            color="text.secondary"
            fontFamily='"Roboto Mono", "Courier New", monospace'
            noWrap
          >
            @{quote.username}
          </Typography>
        )}
      </Box>
      {quote.text ? (
        <Typography
          variant="body2"
          fontFamily='"Roboto Mono", "Courier New", monospace'
          sx={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: "0.85rem",
            color: "text.primary",
          }}
        >
          {quote.text}
        </Typography>
      ) : (
        <Typography
          variant="caption"
          color="text.secondary"
          fontFamily='"Roboto Mono", "Courier New", monospace'
        >
          {quote.url ?? "View quoted tweet"}
        </Typography>
      )}
    </QuoteCard>
  );
}

export default function Tweet({
  id,
  text,
  title,
  createdAt,
  username,
  name,
  mediaUrls,
  media,
  quotedTweet,
  isThreadPart,
  threadRootId,
  searchTerm = "",
  likes = 0,
  fullText = false,
}: TweetProps) {
  const textWrapperRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    if (fullText || !textWrapperRef.current) return;
    const el = textWrapperRef.current;
    setIsOverflowing(el.scrollHeight > el.clientHeight);
  }, [text, fullText]);

  const formattedDate = formatDistanceToNow(new Date(createdAt), {
    addSuffix: true,
  });

  const highlightSearchTerm = (content: string, term: string) => {
    if (!term.trim()) return content;
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = content.split(regex);
    return (
      <>
        {parts.map((part, i) =>
          i % 2 === 1 ? <HighlightedText key={i}>{part}</HighlightedText> : part
        )}
      </>
    );
  };

  const effectiveMedia: TweetMedia[] | undefined =
    media && media.length > 0
      ? media
      : mediaUrls && mediaUrls.length > 0
        ? mediaUrls.map((url, i) => ({
            mediaKey: `legacy-${i}`,
            type: "photo" as const,
            url,
          }))
        : undefined;

  return (
    <AnimatedBox
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      id={`tweet-${id}`}
    >
      <StyledCard>
        <ArchivedBadge>Archived</ArchivedBadge>

        <StyledCardContent>
          <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
            <Avatar
              src="/kj.jpg"
              alt={`${name}'s profile`}
              sx={{ width: 36, height: 36, mr: 1.5, flexShrink: 0 }}
            />
            <Box sx={{ overflow: "hidden", minWidth: 0, flex: 1 }}>
              <Typography
                variant="subtitle2"
                fontWeight="bold"
                fontFamily='"Roboto Mono", "Courier New", monospace'
                noWrap
                sx={{ fontSize: { xs: "0.875rem", sm: "0.875rem" } }}
              >
                {name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                fontFamily='"Roboto Mono", "Courier New", monospace'
                sx={{
                  display: "block",
                  fontSize: { xs: "0.75rem", sm: "0.75rem" },
                }}
                noWrap
              >
                @{username} · {formattedDate}
                {isThreadPart && (
                  <>
                    {" · "}
                    <Typography
                      component="a"
                      href={`/thread/${threadRootId || id}`}
                      variant="caption"
                      onClick={(e) => e.stopPropagation()}
                      sx={{
                        color: "inherit",
                        textDecoration: "none",
                        "&:hover": { color: "text.primary", textDecoration: "underline" },
                      }}
                    >
                      thread
                    </Typography>
                  </>
                )}
              </Typography>
            </Box>
          </Box>

          {title && title !== text.trim() && !text.trim().startsWith(title) && (
            <Title variant="h6">{highlightSearchTerm(title, searchTerm)}</Title>
          )}

          {fullText ? (
            <TweetText>{highlightSearchTerm(text, searchTerm)}</TweetText>
          ) : (
            <>
              <TweetTextWrapper ref={textWrapperRef}>
                <TweetText>{highlightSearchTerm(text, searchTerm)}</TweetText>
              </TweetTextWrapper>
              {isOverflowing && (
                <Typography
                  component="a"
                  href={`/tweet/${id}`}
                  variant="caption"
                  sx={{
                    fontFamily: '"Roboto Mono", monospace',
                    color: "text.secondary",
                    textDecoration: "none",
                    mt: 0.5,
                    display: "block",
                    "&:hover": { color: "text.primary" },
                  }}
                >
                  Read more →
                </Typography>
              )}
            </>
          )}

          {effectiveMedia && <MediaGrid media={effectiveMedia} />}
          {quotedTweet && <QuotedTweetCard quote={quotedTweet} />}

          <Box sx={{ display: "flex", alignItems: "center", mt: "auto", pt: 1 }}>
            <FavoriteBorderIcon sx={{ fontSize: 16, mr: 0.5, color: "text.secondary" }} />
            <Typography
              variant="caption"
              color="text.secondary"
              fontFamily='"Roboto Mono", "Courier New", monospace'
            >
              {likes}
            </Typography>
          </Box>
        </StyledCardContent>
      </StyledCard>
    </AnimatedBox>
  );
}
