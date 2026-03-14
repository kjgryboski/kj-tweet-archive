import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";
import { Card, CardContent, Typography, Box, Avatar, IconButton, Tooltip } from "@mui/material";
import { styled, Theme } from "@mui/material/styles";
import React from "react";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";

export interface TweetProps {
  id: string;
  text: string;
  title?: string;
  createdAt: string;
  username: string;
  name: string;
  mediaUrls?: string[];
  xLink?: string;
  searchTerm?: string;
  likes?: number;
}

const StyledCard = styled(Card)(({ theme }: { theme: Theme }) => ({
  padding: theme.spacing(2),
  marginBottom: 0,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.spacing(1),
  boxShadow: "none",
  position: "relative",
  height: "100%",
  minHeight: "300px",
  display: "flex",
  flexDirection: "column",
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
  width: "100%",
  minWidth: 0,
}));

// Create a styled version of CardContent to remove default padding
const StyledCardContent = styled(CardContent)({
  padding: 0,
  "&.MuiCardContent-root": {
    padding: 0,
    "&:last-child": {
      paddingBottom: 0, // Remove the default bottom padding
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

const TweetText = styled(Typography)(({ theme }: { theme: Theme }) => ({
  fontSize: "1rem",
  lineHeight: 1.5,
  // marginBottom: theme.spacing(1),
  letterSpacing: "-0.01em",
  fontFamily: '"Roboto Mono", "Courier New", monospace',
  flex: 1,
  maxHeight: "200px",
  overflowY: "auto",
  wordBreak: "break-word",
  overflowWrap: "break-word",
  hyphens: "auto",
  "&::-webkit-scrollbar": {
    width: "6px",
  },
  "&::-webkit-scrollbar-track": {
    background: "transparent",
  },
  "&::-webkit-scrollbar-thumb": {
    background: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.2)",
    borderRadius: "3px",
  },
  "&::-webkit-scrollbar-thumb:hover": {
    background: theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.3)",
  },
  [theme.breakpoints.down("sm")]: {
    maxHeight: "none",
    overflowY: "visible",
    fontSize: "0.9rem",
  },
}));

const XIconButton = styled(IconButton)(({ theme }: { theme: Theme }) => ({
  position: "absolute",
  top: theme.spacing(1),
  right: theme.spacing(1),
  color: theme.palette.text.primary,
  padding: theme.spacing(0.5),
  "&:hover": {
    backgroundColor: "transparent",
  },
  borderRadius: "50%",
  fontSize: "1.2rem",
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

export default function Tweet({
  id,
  text,
  title,
  createdAt,
  username,
  name,
  mediaUrls,
  xLink,
  searchTerm = "",
  likes = 0,
}: TweetProps) {
  const formattedDate = formatDistanceToNow(new Date(createdAt), {
    addSuffix: true,
  });

  const openOriginalTweet = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    const tweetUrl = xLink || `https://twitter.com/${username}/status/${id}`;
    window.open(tweetUrl, "_blank");
  };

  // Function to highlight search term in text
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

  return (
    <AnimatedBox
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      id={`tweet-${id}`}
    >
      <StyledCard>
        <Tooltip title="View on X" placement="left">
          <XIconButton onClick={openOriginalTweet} aria-label="View original tweet">
            <svg
              stroke="currentColor"
              fill="currentColor"
              strokeWidth="0"
              viewBox="0 0 512 512"
              height="1em"
              width="1em"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M389.2 48h70.6L305.6 224.2 487 464H345L233.7 318.6 106.5 464H35.8L200.7 275.5 26.8 48H172.4L272.9 180.9 389.2 48zM364.4 421.8h39.1L151.1 88h-42L364.4 421.8z"></path>
            </svg>
          </XIconButton>
        </Tooltip>

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
                sx={{
                  fontSize: { xs: "0.875rem", sm: "0.875rem" },
                }}
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
              </Typography>
            </Box>
          </Box>

          <Title variant="h6">{title ? highlightSearchTerm(title, searchTerm) : "Tweet"}</Title>
          <TweetText>{highlightSearchTerm(text, searchTerm)}</TweetText>

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

          {mediaUrls && mediaUrls.length > 0 && (
            <Box sx={{ mt: "auto" }}>
              <Box
                sx={{ position: "relative", height: 150, borderRadius: "4px", overflow: "hidden" }}
              >
                <Image src={mediaUrls[0]} alt="Tweet media" fill style={{ objectFit: "cover" }} />
              </Box>
            </Box>
          )}
        </StyledCardContent>
      </StyledCard>
    </AnimatedBox>
  );
}
