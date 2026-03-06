import { useState, useEffect } from "react";
import { Zoom, Fab } from "@mui/material";
import { KeyboardArrowUp as KeyboardArrowUpIcon } from "@mui/icons-material";
import { styled } from "@mui/material/styles";

const StyledFab = styled(Fab)(({ theme }) => ({
  position: "fixed",
  bottom: theme.spacing(4),
  right: theme.spacing(4),
  backgroundColor: theme.palette.mode === "dark" ? "#fff" : "#000",
  color: theme.palette.mode === "dark" ? "#000" : "#fff",
  "&:hover": {
    backgroundColor: theme.palette.mode === "dark" ? "#e0e0e0" : "#333",
  },
}));

export default function BackToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > 500) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", toggleVisibility);
    return () => window.removeEventListener("scroll", toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <Zoom in={isVisible}>
      <StyledFab onClick={scrollToTop} size="medium" aria-label="Back to top">
        <KeyboardArrowUpIcon />
      </StyledFab>
    </Zoom>
  );
}
