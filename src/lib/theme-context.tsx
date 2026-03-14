import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { ThemeProvider as MUIThemeProvider, createTheme, Theme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

// Define the type for the context
type ColorMode = "light" | "dark";
interface ThemeContextType {
  colorMode: ColorMode;
  toggleColorMode: () => void;
  theme: Theme;
}

// Create the context with a default value
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Type for the provider props
interface ThemeProviderProps {
  children: ReactNode;
}

// Create light and dark theme configurations
const getTheme = (mode: ColorMode) =>
  createTheme({
    palette: {
      mode,
      ...(mode === "light"
        ? {
            // Light mode palette
            primary: {
              main: "#000000",
            },
            secondary: {
              main: "#ffffff",
            },
            background: {
              default: "#ffffff",
              paper: "#ffffff",
            },
            text: {
              primary: "#000000",
            },
          }
        : {
            // Dark mode palette
            primary: {
              main: "#ffffff",
            },
            secondary: {
              main: "#000000",
            },
            background: {
              default: "#000000",
              paper: "#000000",
            },
            text: {
              primary: "#ffffff",
            },
          }),
    },
    typography: {
      fontFamily: '"Roboto Mono", "Courier New", monospace',
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            scrollBehavior: "smooth",
            transition: "background-color 0.3s ease, color 0.3s ease",
          },
        },
      },
    },
  });

// Create the provider component
export function ThemeProvider({ children }: ThemeProviderProps) {
  // Check for saved theme preference or use system preference
  const getSavedMode = (): ColorMode => {
    if (typeof window !== "undefined") {
      const savedMode = localStorage.getItem("colorMode") as ColorMode;
      if (savedMode) return savedMode;

      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      return prefersDark ? "dark" : "light";
    }
    return "light"; // Default for SSR
  };

  const [colorMode, setColorMode] = useState<ColorMode>("light");

  // Initialize with saved preference after component mounts
  useEffect(() => {
    setColorMode(getSavedMode());
  }, []);

  // Toggle between light and dark mode
  const toggleColorMode = useCallback(() => {
    setColorMode((prevMode) => {
      const newMode = prevMode === "light" ? "dark" : "light";
      if (typeof window !== "undefined") {
        localStorage.setItem("colorMode", newMode);
      }
      return newMode;
    });
  }, []);

  // Memoize the theme to prevent unnecessary re-renders
  const theme = useMemo(() => getTheme(colorMode), [colorMode]);

  // Provide the context value
  const value = useMemo(() => ({
    colorMode,
    toggleColorMode,
    theme,
  }), [colorMode, toggleColorMode, theme]);

  return (
    <ThemeContext.Provider value={value}>
      <MUIThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MUIThemeProvider>
    </ThemeContext.Provider>
  );
}

// Custom hook to use the theme context
export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useThemeContext must be used within a ThemeProvider");
  }
  return context;
}
