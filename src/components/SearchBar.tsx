import React, { useState } from "react";
import { TextField, InputAdornment, IconButton, Box, Typography, Chip } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { styled, Theme } from "@mui/material/styles";
import { TweetProps } from "./Tweet";

interface SearchBarProps {
  tweets: TweetProps[];
  onSearch?: (term: string) => void;
}

const SearchContainer = styled(Box)({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  marginBottom: 0,
  marginTop: 0,
});

const SearchControls = styled(Box)(({ theme }: { theme: Theme }) => ({
  display: "flex",
  alignItems: "center",
  marginTop: theme.spacing(1),
  gap: theme.spacing(1),
  justifyContent: "space-between",
}));

const NavigationControls = styled(Box)(() => ({
  display: "flex",
  alignItems: "center",
  gap: "8px",
}));

const ResultsText = styled(Typography)(() => ({
  fontFamily: '"Roboto Mono", "Courier New", monospace',
  fontSize: "0.9rem",
}));

export default function SearchBar({ tweets, onSearch }: SearchBarProps) {
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<{ tweetId: string; index: number }[]>([]);
  const [currentResult, setCurrentResult] = useState(-1);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const executeSearch = () => {
    if (!inputValue.trim()) {
      setSearchTerm("");
      setSearchResults([]);
      setCurrentResult(-1);
      if (onSearch) onSearch("");
      return;
    }

    setSearchTerm(inputValue);
    if (onSearch) onSearch(inputValue);

    // Find all tweets containing the search term
    const results: { tweetId: string; index: number }[] = [];
    tweets.forEach((tweet, index) => {
      const tweetText = tweet.text.toLowerCase();
      const tweetTitle = (tweet.title || "").toLowerCase();

      if (
        tweetText.includes(inputValue.toLowerCase()) ||
        tweetTitle.includes(inputValue.toLowerCase())
      ) {
        results.push({ tweetId: tweet.id, index });
      }
    });

    setSearchResults(results);
    setCurrentResult(results.length > 0 ? 0 : -1);

    // Scroll to the first result if found
    if (results.length > 0) {
      scrollToTweet(results[0].tweetId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      executeSearch();
    }
  };

  const clearSearch = () => {
    setInputValue("");
    setSearchTerm("");
    setSearchResults([]);
    setCurrentResult(-1);
    if (onSearch) onSearch("");
  };

  const navigateResult = (direction: "prev" | "next") => {
    if (searchResults.length === 0) return;

    let newIndex;
    if (direction === "next") {
      newIndex = (currentResult + 1) % searchResults.length;
    } else {
      newIndex = (currentResult - 1 + searchResults.length) % searchResults.length;
    }

    setCurrentResult(newIndex);
    scrollToTweet(searchResults[newIndex].tweetId);
  };

  const scrollToTweet = (tweetId: string) => {
    const tweetElement = document.getElementById(`tweet-${tweetId}`);
    if (tweetElement) {
      tweetElement.scrollIntoView({ behavior: "smooth", block: "center" });

      // Highlight the tweet temporarily
      tweetElement.classList.add("highlight-tweet");
      setTimeout(() => {
        tweetElement.classList.remove("highlight-tweet");
      }, 1500);
    }
  };

  return (
    <SearchContainer>
      <TextField
        fullWidth
        placeholder="SEARCH TWEET"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        variant="outlined"
        size="small"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <IconButton onClick={executeSearch} size="small" aria-label="search">
                <SearchIcon />
              </IconButton>
            </InputAdornment>
          ),
          endAdornment: inputValue && (
            <InputAdornment position="end">
              <IconButton onClick={clearSearch} edge="end" size="small" aria-label="clear search">
                <ClearIcon />
              </IconButton>
            </InputAdornment>
          ),
          sx: {
            fontFamily: '"Roboto Mono", "Courier New", monospace',
            borderRadius: 1,
          },
        }}
      />

      {searchResults.length > 0 && (
        <SearchControls>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <ResultsText color="text.secondary">
              {currentResult + 1} of {searchResults.length} results
            </ResultsText>

            <Chip
              label={`${searchTerm}`}
              size="small"
              variant="outlined"
              sx={{ fontFamily: '"Roboto Mono", "Courier New", monospace' }}
            />
          </Box>

          <NavigationControls>
            <IconButton
              onClick={() => navigateResult("prev")}
              disabled={searchResults.length <= 1}
              size="small"
            >
              <KeyboardArrowUpIcon />
            </IconButton>
            <IconButton
              onClick={() => navigateResult("next")}
              disabled={searchResults.length <= 1}
              size="small"
            >
              <KeyboardArrowDownIcon />
            </IconButton>
          </NavigationControls>
        </SearchControls>
      )}
    </SearchContainer>
  );
}
