import React, { useState, useRef, useEffect, useCallback } from "react";
import { TextField, InputAdornment, IconButton, Box, Typography, CircularProgress } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import { styled } from "@mui/material/styles";

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
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const executeSearch = useCallback((term: string) => {
    if (!term.trim()) {
      setHasSearched(false);
      onClear();
      return;
    }
    setHasSearched(true);
    onServerSearch(term.trim());
  }, [onServerSearch, onClear]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Debounce search by 300ms
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      executeSearch(value);
    }, 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      executeSearch(inputValue);
    }
  };

  const clearSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setInputValue("");
    setHasSearched(false);
    onClear();
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

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
                {isSearching ? (
                  <CircularProgress size={20} sx={{ ml: 0.5, mr: 0.5 }} />
                ) : (
                  <IconButton onClick={() => executeSearch(inputValue)} size="small" aria-label="search">
                    <SearchIcon />
                  </IconButton>
                )}
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
