import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { ThemeProvider } from "@/lib/theme-context";
import { Roboto_Mono } from "next/font/google";
import ErrorBoundary from "@/components/ErrorBoundary";

const robotoMono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-roboto-mono",
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={robotoMono.variable}>
      <ErrorBoundary>
        <ThemeProvider>
          <Component {...pageProps} />
        </ThemeProvider>
      </ErrorBoundary>
    </div>
  );
}
