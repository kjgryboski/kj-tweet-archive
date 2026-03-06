import React from "react";
import { IconButton, Tooltip, styled } from "@mui/material";
import { Theme } from "@mui/material/styles";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";

interface ThemeToggleProps {
  toggleColorMode: () => void;
  mode: "light" | "dark";
}

const ToggleButton = styled(IconButton)(({ theme }: { theme: Theme }) => ({
  position: "fixed",
  top: theme.spacing(2),
  right: theme.spacing(2),
  zIndex: 1000,
  backgroundColor:
    theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.2)",
  color: theme.palette.mode === "dark" ? "#fff" : "#000",
  transition: "all 0.3s ease-in-out",
  "&:hover": {
    backgroundColor:
      theme.palette.mode === "dark" ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.3)",
    transform: "scale(1.1)",
  },
  boxShadow: theme.shadows[3],
}));

const ThemeToggle: React.FC<ThemeToggleProps> = ({ toggleColorMode, mode }) => {
  return (
    <Tooltip title={`Switch to ${mode === "light" ? "dark" : "light"} mode`} placement="left">
      <ToggleButton
        onClick={toggleColorMode}
        aria-label={`Switch to ${mode === "light" ? "dark" : "light"} mode`}
        size="large"
      >
        {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
      </ToggleButton>
    </Tooltip>
  );
};

export default ThemeToggle;
