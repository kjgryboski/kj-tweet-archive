import React, { useState, useRef, useEffect } from "react";
import { TextField, InputAdornment, IconButton, Box, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import { styled, Theme } from "@mui/material/styles";

interface SearchBarProps {
  onServerSearch: (term: string) => void;
  onClear: () => void;
  resultCount?: number;
  isSearching?: boolean;
}

const SearchContainer = styled(Box)({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  marginBottom: 0,
  marginTop: 0,
});

const ResultsText = styled(Typography)(() => ({
  fontFamily: '"Roboto Mono", "Courier New", monospace',
  fontSize: "0.9rem",
}));

export default function SearchBar({ onServerSearch, onClear, resultCount, isSearching }: SearchBarProps) {
  const [inputValue, setInputValue] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const executeSearch = () => {
    if (!inputValue.trim()) {
      clearSearch();
      return;
    }
    setHasSearched(true);
    onServerSearch(inputValue.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      executeSearch();
    }
  };

  const clearSearch = () => {
    setInputValue("");
    setHasSearched(false);
    onClear();
  };

  // Keyboard shortcut: Ctrl+K or / to focus search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

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
        inputRef={inputRef}
        slotProps={{
          input: {
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
          },
        }}
      />

      {hasSearched && !isSearching && resultCount !== undefined && (
        <Box sx={{ display: "flex", alignItems: "center", mt: 1, gap: 1 }}>
          <ResultsText color="text.secondary">
            {resultCount} {resultCount === 1 ? "result" : "results"} found
          </ResultsText>
        </Box>
      )}
    </SearchContainer>
  );
}
